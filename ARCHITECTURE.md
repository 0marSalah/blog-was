# Architecture

This isn't really a blog project. It's an excuse to learn what it actually
takes for a plain browser app to talk to Wallet Attached Storage: identity,
auth, reading, writing, and now following. The eventual goal is an ActivityPub
reader. So this doc cares more about "what we tried and why" than "here's the
code" -- the reasoning is the part that's easy to lose later.

## Where things stand

One author publishes to their own Space through a wallet-delegated capability,
and reads other people's blogs by following a URL. Two screens (auth, home)
and two tabs (Home, Feed). Three collections, two public and one private. No
routing library, no editing, no deleting.

Everything below was actually run against a live server -- first a local
`was-teaching-server`, now the deployed `https://freewallet.cloud`. Nothing
here is guessed; where something is inferred from library source rather than
observed over the wire, it says so.

## File map

- `src/app.config.ts` -- the two constants that are not WAS settings:
  `BLOG_ID` (the fixed id that keeps the blog's public URL predictable) and
  `EXPECTED_SERVER_URL` (which selects nothing -- see below).
- `src/wasApp.ts` -- the app's declaration of itself: collections and their
  visibility, the entity stores, and the `StoreRegistry` sync uses.
- `src/blog.ts` -- the author's own blog document. `ensureBlog()` creates or
  refreshes it; `blogUrl()` / `postsUrl()` / `spaceTopology()` compose the
  addresses that make it followable. Also `waitForRemoteStore()`, which
  everything here depends on.
- `src/feed.ts` -- the read side. `fetchBlog()`, `fetchPosts()`, `loadFeed()`,
  every one an unsigned public GET, plus `followBlog()`, the one write (to the
  private `follows` collection) that every way of following goes through.
- `src/directory.ts` -- the server's opt-in blog directory: `listDirectory()`
  (unsigned GET), `joinDirectory()` / `leaveDirectory()` (signed with the
  session key).
- `src/types.ts` -- the data model (`Blog`, `BlogPost`, `Follow`, `AssetRef`).
  Still deliberately ignorant of WAS.
- `src/WasConnection.tsx` -- switches between `Auth` and `Home` on session
  status. No router for two screens.
- `src/pages/Auth.tsx` -- one button. App Connect via CHAPI.
- `src/pages/Home.tsx` -- protected. The masthead nav, the views, the
  `?blog=` share-link entry point, and the one-time Discover question.
- `src/pages/Feed.tsx` -- follow a blog by URL, and the merged timeline.
- `src/pages/Discover.tsx` -- the directory's blogs, each read live.
- `src/pages/BlogPreview.tsx` -- one blog read from outside, with Follow.
- `src/pages/DiscoverPrompt.tsx` -- "Show your blog on the Discover page?"
- `src/styles/theme.ts` -- MUI, dark mode, that's it.

Gone since the last version of this doc: `src/wasRequest.ts` (`WasServer`)
and `src/lib/authIdentity.ts`. See "The identity story" below -- they were
removed on purpose, not lost. `src/app.config.ts` is back, but it holds two
constants rather than the server URL and identity the old one carried.

## The three collections

Declared once, in `wasApp.ts`, and the wallet provisions them at login:

```
blogs    public    the actor -- name, and a pointer at the posts
posts    public    the outbox -- what everyone can read
follows  private   who you read -- nobody else's business
```

That split is ActivityPub's actor/outbox shape, and the privacy line falls
where it should: what you publish is world-readable, and what you *read* is
encrypted at rest and on the server. `follows` syncs across your own devices
and reaches nobody else. The followed author is never told.

`visibility` is not a suggestion the app makes to itself. It becomes the
descriptor type in the App Connect request -- `#public-collection` versus
`#private-collection` -- and the wallet provisions accordingly. Two
consequences worth knowing:

- **Public implies plaintext.** No per-collection cipher, and the LWW
  bookkeeping rides along in the clear. A public post's JSON carries
  `writerId`, a random per-install label that is stable across everything that
  install publishes -- so it links an author's posts to each other for anyone
  reading raw JSON. Intended or not, it is visible.
- **A wallet that predates the type fails closed.** It resolves the descriptor
  UNSATISFIABLE rather than silently provisioning a private collection the app
  believes is public. That is the right failure.

## Identity: what signed it is not who wrote it

The app holds a seed-derived `did:key`. It is scoped to (user, origin,
appUrl), so the same person publishing from a different app has a different
one, and a `did:key` document is just the public key restated -- there is no
address inside it to fetch.

So it is published as `Blog.signingKey`, meaning *this is what signed the
writes*, and never used as a byline. Identity is a URL instead, the way
ActivityPub does it. A post's `attributedTo` is the blog document's URL: an
address that resolves to something, rather than a key that resolves to
nothing.

An earlier version put `author: controllerDid` on every post. That was wrong
twice over, for both reasons above.

## The blog document, and why the indirection

A follower stores exactly one string: the blog document's URL. That document
carries `postsUrl`.

```
Blog URL  ->  { name, postsUrl, signingKey }  ->  posts collection  ->  posts
```

The extra hop is the point. Posts can move, or be joined by a second feed,
without every follower's stored string going stale. It is the same reason
`id` and `url` are separate fields on a post: identity and current address
are different things, and conflating them is the classic RSS bug where
changing hosts makes your whole feed look brand new to every subscriber.

`blogUrl()` is pure string composition from space + collection + document id,
so it is known *before* the document exists. That is what lets the document
carry its own address.

## How a post gets published

```
wallet (CHAPI App Connect)
     |  delegates a capability per collection, to an app-specific key it mints
     v
was-react session  ->  local replica (RxDB)  ->  background sync  ->  Space
     ^
     |  the app only ever touches the entity store
   usePosts().insert({ ..., attributedTo: blog.url })
```

The app never builds a `WasClient`, never signs a request, and never names a
server. All three arrive inside the wallet's grants. `EXPECTED_SERVER_URL`
exists only to *notice* when a restored session is pointed somewhere else --
it selects nothing.

That matters more than it sounds: the server URL is frozen into the stored
session at login, so changing the wallet's config does not move an
already-connected session. Signing out and back in is the only way across.

## The feed: pull, not push

Mastodon's home timeline is push-based. Your server holds a follow
relationship, remote servers deliver new posts into its inbox, and the
timeline is read out of what your server already received.

Here nobody receives anything. `loadFeed()` walks the follow list, resolves
each blog document, lists its posts collection, and merges the results
reverse-chronologically in the browser. Closer to a feed reader than to
federation:

- No server component, no delivery, no inbox.
- No Follow/Accept handshake. Following is unilateral and needs no consent,
  because reading a public collection needs nothing from its author.
- "New" only means "new since you last looked."

Two deliberate choices inside it:

**Followed posts never enter `usePosts`.** That store is backed by the local
replica, which the sync controller pushes to *your* Space -- putting someone
else's posts in it would republish them under your own identity. Followed
content stays read-only and in memory.

**Failures are collected, not thrown.** `Promise.allSettled` per follow, so
one unreachable host costs its own row and nothing else. A feed that silently
drops a dead source is worse than one that names it.

One wart, worth fixing when the library allows: `feed.ts` reads through
`requireRemoteStore()`, so the feed currently needs a connected session even
though every request it makes is an unsigned public GET. That is a limitation
of `was-react` not exposing a signer-less public reader, not a property of the
data. Anyone can read these URLs with `curl`; only this app insists on a
session first.

## What "public" actually means here

Verified over the wire against `https://freewallet.cloud`, no auth headers:

```
GET /space/:id/posts/            -> 200, the listing
GET /space/:id/posts/:postId     -> 200, the post body
GET /space/:id/blogs/blog        -> 200, the blog document
POST /space/:id/posts/ unsigned  -> 401, refused
```

So reads are open and writes still need the author's key. That is the shape a
blog wants.

The mechanism is a server-side policy document, `{ type: 'PublicCanRead' }`,
hung on a Space, Collection, or Resource. When set, the server answers
unsigned GETs on that thing and everything under it. **Identity is never
consulted on the read path** -- which means "view it from another account" and
"view it from a different wallet" are not different tests. A different wallet
gets exactly the same bytes as no wallet. The only test that proves anything
is no identity at all, and `curl` is the honest version of it.

The guarantee is made by the *wallet*, at provisioning time, not by this app.
Nothing in `was-react` ever calls `setPublic()` -- grep it. Worth knowing for
the dev-sync path in particular: `provisionDevGrants` creates a public
collection plaintext but never sets the policy, so a collection provisioned
that way is capability-only no matter what the config says.

Three sharp edges found the hard way:

- **A 404 tells you nothing.** The server conflates "missing" with "not
  readable by you". A reader cannot distinguish a typo from a private
  collection, and neither can the code.
- **The policy is not itself public.** `GET .../posts/policy` returns 401.
  There is no anonymous way to ask "is this published?" separately from "does
  this exist?", so a successful listing *is* the proof -- there is no cheaper
  signal, and no diagnostic to build.
- **`query` stays capability-only even on a public collection.** The declared
  `indexes` are usable anonymously only through the plaintext
  `filter[attr]=value` GET, not the query endpoint. Don't reach for `query`
  when extending the read path.

## Discovery: an opt-in directory on the server

A reader can only read a Space whose id someone handed them. Checked directly:

```
GET /spaces/         -> 200, but { totalItems: 0 }  -- it lists spaces the
                        CALLER CONTROLS, and a reader controls none
GET /space/:id       -> 404 anonymously  -- only the collections carry the
                        public policy, not the Space around them
```

So no WAS server answers "what public blogs do you host?" on its own, and no
client can find out by crawling. The answer this app settled on is a small
opt-in directory that `was-teaching-server` hosts beside the protocol
(`/directory/blogs`, turned on with `WAS_BLOG_DIRECTORY=true`):

- The directory holds only blog URLs. Listing it is an unsigned GET, and the
  Discover page reads every blog's own document live, so a card never shows a
  stale name and a blog that stopped answering simply drops out.
- Joining and leaving are signed with the session key, and the server accepts
  them only when that key is the `signingKey` the public blog document names.
  That is the one place `signingKey` does real work: it proves the request
  came from the blog's own app, so nobody can list someone else's blog.
- The author is asked once, right after the blog exists. The answer is stored
  on the blog document as `discoverable`, so it follows the author across
  devices instead of living in one browser, and the blog page has a switch to
  change it.
- The server reads the blog from its own storage before listing it, so a blog
  created seconds ago is refused until sync has pushed it. `joinDirectory`
  waits for the document to answer publicly first.

An earlier attempt at this shipped a client-side blogroll -- a seed list in
`localStorage`, grown by share links -- and was replaced by the follow model,
which stores the same thing durably in a private collection instead of a
browser. Share links still matter alongside the directory: "Copy link" now
hands out an app link (`?blog=<blog URL>`) that opens the blog's preview,
instead of a URL that answers with JSON.

## One concurrency bug worth remembering

`ensureBlog()` was a check-then-act sequence: hydrate, look for the document,
and insert if absent. `upsert` routes insert-vs-update off the hydration
index, so two concurrent calls both read an empty index, both take the insert
branch, and the loser gets a `CONFLICT` on a document the winner created a
millisecond earlier.

React's `StrictMode` does exactly this in development -- mount, run the effect,
unmount, mount again. The effect's `cancelled` flag does not help: it
suppresses the state update, not the request already in flight. The symptom
was a wall of RxDB error text on the home page describing a write that had, in
fact, succeeded.

Fixed in two layers, because the two races are different:

- **In-flight de-duplication**, keyed on signing key, so concurrent callers in
  this tab share one promise. It is a de-duplication window, not a result
  cache -- cleared on settle, so a later call still re-reads.
- **Conflict tolerance**: a `CONFLICT` (or HTTP 409) is treated as success --
  re-hydrate and adopt whichever document won. The candidates differ only in
  timestamps, so fighting for the write would be two writers overwriting each
  other with equivalent content. This covers the race single-flight cannot: a
  second tab, or another device.

## The identity story -- five things we built, then un-built

Worth keeping because the code doesn't show any of this happened anymore.

We started with sign-up/sign-in pages, a DID generated in the browser, its key
encrypted to a passphrase with our own PBKDF2 + AES-GCM, saved in IndexedDB.
It worked. Then we noticed Freewallet already has a real version of this, so
we swapped in its actual `@interop/wallet-core/keyring` primitives -- same
600,000-iteration KDF, same signed-record sealing -- just kept local, since we
had no WAS "Unlock Space" yet.

Then real CHAPI login: DID Authentication plus a self-issued Login Credential,
checked against the live `authn.io` mediator. Then App Connect on top of it.

Then we asked whether a single-author blog needed any of it, decided no, and
tore all of it out in favour of a hardcoded `AUTHOR_DID` with its secret in a
gitignored `.env.local`.

Then we built a full passphrase-based register/login on top of *that*: a
passphrase deriving an unlock identity that owned its own Space, holding the
author's real key encrypted, addressed by a hash of the unlock DID so nothing
had to be remembered. It was tested properly, including the literal
two-browser test -- register in one Playwright profile, log in from an empty
second one, same identity and same Space. It worked.

And then it came out too, because App Connect had come back as the answer.
The trade-offs that system accepted -- one key in one place, nothing
revocable, a passphrase as the entire wall -- are all things a wallet already
solves better, and solving them again in an app that is *about* talking to
wallets was the wrong place to stand. `useLogin()` is now the whole of it: one
CHAPI popup that proves who you are and returns per-collection capabilities,
minted against an app-specific key the wallet holds. The first connection is
the account. There is no register step.

The lesson generalises past identity: nearly every hand-rolled piece in this
project -- the crypto, the request wrapper, the auth pages -- got replaced by
something the ecosystem already had, and the app got smaller each time.

## What WAS itself felt like to use

The actual research output, written down as it happened:

**Nothing gets created for you.** A Space doesn't come with a `posts`
collection in it. Adding a collection to `wasAppConfig` is not enough either
-- capabilities are granted per collection at login, so a session that
predates a new collection has no grant for it and fails with "No delegated
capability" until you sign out and back in. `Home.tsx` detects that specific
message and says so, because the raw error does not suggest the fix.

**Listing doesn't hand you content.** A listing carries `{ id, url,
contentType }` and no bodies, so rendering N posts costs 1 + N requests. That
is the honest cost of the public read path today.

**`connected` does not mean ready.** The auth store starts replication in the
background and writes `connected` immediately -- deliberately, so a down
server never blocks entry to the app. Anything that reads the space topology
has to wait for the remote store to actually land, which is why
`waitForRemoteStore()` exists and why every entry point calls it.

**The server URL has to match byte for byte.** It is baked into every signed
capability's target: `localhost` and `127.0.0.1` are different strings even
though they are the same server. The same lesson bit again from the other
direction when a `curl` went to `freewallet.me` (the wallet SPA, which serves
its `index.html` for any path) instead of `freewallet.cloud` (the storage
server) -- and the only symptom was `jq` choking on `<!doctype`. Check
`content_type` before piping to `jq`; `text/html` means wrong host, every
time.

**A Space id is bound to the server that issued it.** It does not resolve
anywhere else, so switching servers means provisioning a new Space, not
repointing at the old id.

One pleasant surprise, still true: creating a Space and making a collection
public need none of the ceremony we expected -- `createSpace()` and
`setPublic()`, one call each.

## Look

MUI, dark mode only, no toggle, nobody asked for a light one.

## What's still missing

No editing or deleting a post once published (unfollowing a blog works; a
post is write-once). No pagination anywhere -- `loadFeed` reads every post of
every followed blog on every refresh, which is fine for a handful and
obviously not for more. No editing of the blog's name or description after
first run. Reading still requires a session for no good reason (above).
The Discover directory has no moderation tooling yet: removing a bad entry
means the server operator's key, or editing server storage directly.

And nothing here is a *page*: a post has a URL that returns JSON, not
something a second person can visit and read. The ActivityPub port the data
model was shaped for is still ahead, not behind.
