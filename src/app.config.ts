/**
 * The constants that have to stay consistent across the app, kept apart from
 * `wasApp.ts` so that file is only the WAS wiring -- collections, stores, and
 * the sync registry.
 *
 * Neither of these is a WAS setting. One names a document this app happens to
 * publish; the other is an expectation the app checks itself against. Nothing
 * here is sent to a server.
 */

/**
 * The single blog this app publishes. A fixed id (rather than a uuid) so the
 * blog's public URL is stable and predictable -- one author, one blog, for
 * now.
 */
export const BLOG_ID = 'blog'

/**
 * The WAS server this app is meant to be talking to. Nothing here selects it
 * -- the wallet does, and its choice arrives inside the delegated grants -- so
 * this constant exists only to notice when the running session is pointed
 * somewhere else (a session persisted against a previous server, restored on
 * reload long after the wallet's own config changed).
 *
 * `VITE_EXPECTED_SERVER_URL` overrides it; otherwise a dev build expects the
 * local teaching server and a production build expects freewallet.cloud.
 */
export const EXPECTED_SERVER_URL: string =
  import.meta.env.VITE_EXPECTED_SERVER_URL ??
  (import.meta.env.DEV ? 'http://localhost:3002' : 'https://freewallet.cloud')

/**
 * The name a blog is created with, before its author has set one. Named
 * rather than inlined because two places care: `ensureBlog` writes it, and
 * the profile form recognises it to prompt for something better. A followed
 * blog is identified by name in the feed, so leaving every blog on this
 * default makes a multi-author timeline unreadable.
 */
export const DEFAULT_BLOG_NAME = 'My Blog'

/**
 * The query parameter a share link carries: `?blog=<blog document URL>` opens
 * that blog's preview once the app loads.
 */
export const BLOG_LINK_PARAM = 'blog'
