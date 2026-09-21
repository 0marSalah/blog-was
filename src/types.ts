export interface Blog {
  id: string
  type: 'Blog'

  name: string
  description?: string

  /**
   * The author's answer to "show this blog on the Discover page?": `true` once
   * the server's directory accepted it, `false` for no. Absent until answered,
   * which is what makes the question ask itself exactly once per blog.
   */
  discoverable?: boolean

  /**
   * This document's own world-readable URL: the blog's stable identity, and
   * the single string a follower has to keep. Composed by `publicUrlFor`
   * from the space + collection + document id, so it is known before the
   * document is ever written.
   */
  url: string

  /**
   * Where the posts live -- the public `posts` collection URL. A reader
   * fetches `url`, reads this, then lists it. That indirection is the whole
   * point: the posts can move, or be joined by a second feed, without every
   * follower's stored string going stale.
   */
  postsUrl: string

  /**
   * The app's seed-derived `did:key`: what SIGNED the writes, not who wrote
   * them. Published so a reader can verify, never used as the byline -- it is
   * scoped to (user, origin, appUrl), so the same person writing from another
   * app has a different one, and a `did:key` document is just the public key
   * restated, with no address in it to follow.
   */
  signingKey: string

  createdAt: string
  updatedAt: string
}

export interface BlogPost {
  id: string
  type: 'BlogPost'

  blogId: string

  /**
   * The URL of the `Blog` document this post is by -- an address that
   * resolves to a document, rather than a key that resolves to nothing.
   * ActivityPub spells this `attributedTo`; keeping the name means the later
   * port is a rename, not a redesign.
   */
  attributedTo: string

  title: string
  description?: string

  content: string
  contentType: 'text/markdown'

  url: string

  publishedAt: string
  updatedAt: string
}

/**
 * One followed blog. The Mastodon parallel is a follow relationship, with one
 * difference that matters: this one is UNILATERAL. There is no Follow/Accept
 * handshake and no `followers` collection -- the followed author is never told,
 * because reading their posts needs nothing from them. Closer to an RSS
 * subscription than to an ActivityPub follow.
 */
export interface Follow {
  id: string
  type: 'Follow'

  /**
   * The followed `Blog` document's URL. The only field a follow strictly
   * needs: everything else (name, where the posts are) is read back out of
   * the document it points at, so it stays correct when the author changes it.
   */
  blogUrl: string

  /**
   * Last resolved name, cached only so the list renders something before the
   * fetch lands. The document is always the source of truth.
   */
  name?: string

  followedAt: string
  updatedAt: string
}

export interface AssetRef {
  id: string
  url: string

  mediaType: string
  byteLength: number

  digest: string
}
