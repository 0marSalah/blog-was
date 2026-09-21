# Changelog

Notable changes to this project. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project is
pre-release and does not yet carry version numbers.

## [Unreleased]

### Added

- **Discover page.** Blogs whose authors opted in, read from the server's blog
  directory (`/directory/blogs` on `was-teaching-server`). Each card is loaded
  live from the blog's own document; opening one shows a preview with a
  Follow button.
- **"Show your blog on the Discover page?"** Asked once after the blog exists,
  stored on the blog document as `discoverable`, and switchable from the blog
  page. Joining and leaving are signed with the session key, which the server
  checks against the blog's `signingKey`.
- **Blog preview.** Any blog can be opened and read before following it.
- **Share links open the app.** "Copy link" gives `?blog=<blog URL>`, which
  opens that blog's preview, instead of the raw JSON document URL.
- `src/directory.ts` -- `listDirectory()`, `joinDirectory()`,
  `leaveDirectory()`. `followBlog()` in `src/feed.ts` is now shared by every
  way to follow.
- **Blog identity documents.** A public `blogs` collection holding one `Blog`
  per author, carrying its own world-readable `url` plus a `postsUrl` pointer
  at the posts collection. This is the actor half of ActivityPub's
  actor/outbox split: a follower stores one URL, and the posts can move
  without that URL going stale.
- **A follow feed.** A private `follows` collection, and a Feed tab that
  resolves each followed blog, lists its posts, and merges everything into one
  reverse-chronological timeline. Following is unilateral and needs no
  consent -- the followed author is never contacted and never learns of it,
  closer to an RSS subscription than to an ActivityPub follow.
- `src/blog.ts` -- `ensureBlog()`, the URL composers (`blogUrl`, `postsUrl`,
  `spaceTopology`), and `waitForRemoteStore()`.
- `src/feed.ts` -- the anonymous read path: `fetchBlog()`, `fetchPosts()`,
  `loadFeed()`. Every request it makes is an unsigned public `GET`.
- `src/app.config.ts` -- `BLOG_ID` and `EXPECTED_SERVER_URL`, split out of
  `wasApp.ts` so that file is only WAS wiring. Neither constant is a WAS
  setting: one names a document, the other is an expectation the app checks
  itself against.
- The blog's public URL is shown on the home screen with a copy button -- the
  single string a follower needs.
- An alert when the running session's server does not match
  `EXPECTED_SERVER_URL`, explaining that the server is frozen into the stored
  session at login and that signing out is the only way across.

### Changed

- **A post is attributed to a URL, not a key.** `BlogPost.author` (the app's
  `did:key`) is replaced by `attributedTo`, the blog document's URL. The
  signing key was wrong as a byline twice over: it is scoped to
  (user, origin, appUrl) so it names the app rather than the person, and a
  `did:key` document is just the public key restated, with no address in it to
  follow. The key is still published, as `Blog.signingKey`, meaning only
  "this is what signed the writes".
- `EXPECTED_SERVER_URL` now points at `https://freewallet.cloud` rather than a
  local `was-teaching-server`.
- `ARCHITECTURE.md` rewritten against the current app. The previous version
  described a passphrase-based identity system and three files that no longer
  exist.

### Fixed

- **A write conflict on first run.** `ensureBlog()` was a check-then-act
  sequence, and `upsert` routes insert-vs-update off the hydration index, so
  two concurrent calls both took the insert branch and the loser raised
  `CONFLICT` on a document that had been created correctly a millisecond
  earlier. React's `StrictMode` reproduced this on every development mount,
  surfacing a wall of RxDB error text describing a write that had in fact
  succeeded. Fixed in two layers: in-flight de-duplication keyed on signing
  key for callers in one tab, and treating `CONFLICT` as success -- re-reading
  and adopting the document that won -- for the cross-context race a single
  tab cannot see.

### Removed

- `BlogPost.assets`. The `AssetRef` type stays in `types.ts`; nothing
  references it yet.
