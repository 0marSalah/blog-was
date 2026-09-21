import { requireRemoteStore } from '@interop/was-react'
import { waitForRemoteStore } from './blog'
import { useFollows } from './wasApp'
import type { Blog, BlogPost, Follow } from './types'

/**
 * The follow feed: Mastodon's Home timeline, assembled in the reader instead
 * of on a server.
 *
 * Mastodon's home timeline is PUSH-based -- your server holds a follow
 * relationship, remote servers deliver new posts into its inbox, and the
 * timeline is read out of what your server already received. Here nobody
 * receives anything: the reader PULLS each followed blog on demand. Closer to
 * a feed reader than to federation, and it means no server component, no
 * delivery, and no way for a followed author to know they are being read.
 * The cost is that "new" only means "new since the last time you looked".
 *
 * Every read below is an unsigned public GET -- the same requests any
 * anonymous visitor could make. They borrow the session's `WasClient` purely
 * because `was-react` does not expose a signer-less public reader yet; nothing
 * about the requests is authenticated. The one write, `followBlog`, goes to
 * the reader's own private `follows` collection.
 */

/**
 * One row of the merged timeline: the post plus enough of its source to
 * render a byline without a second lookup.
 */
export interface FeedItem {
  post: BlogPost
  blogName: string
  blogUrl: string
}

/**
 * A per-follow failure. Collected rather than thrown so one unreachable
 * author cannot empty the whole timeline.
 */
export interface FeedError {
  blogUrl: string
  message: string
}

/**
 * Reads one public JSON resource, or `null` when it is missing, not public,
 * or binary. A 404 here is deliberately ambiguous (the server conflates
 * "absent" with "not readable by you"), so callers cannot distinguish a typo
 * from a private collection.
 *
 * @param url {string}   absolute resource URL
 * @returns {Promise<T | null>}
 */
async function readPublicJson<T>(url: string): Promise<T | null> {
  const { was } = requireRemoteStore()
  const body = await was.publicRead({ resourceUrl: url })
  if (body === null || body instanceof Blob) {
    return null
  }
  return body as T
}

/**
 * Resolves a blog document by its URL -- the first hop of a follow, and where
 * `postsUrl` comes from.
 *
 * @param blogUrl {string}
 * @returns {Promise<Blog | null>}
 */
export async function fetchBlog(blogUrl: string): Promise<Blog | null> {
  return readPublicJson<Blog>(blogUrl)
}

/**
 * Follows a blog by its URL. Shared by the paste box, the blog preview and
 * the Discover page, so every way in stores a follow the same way.
 *
 * @param blogUrl {string}
 * @returns {Promise<void>}
 */
export async function followBlog(blogUrl: string): Promise<void> {
  const url = blogUrl.trim()
  await useFollows.getState().hydrate()
  const follows = [...useFollows.getState().byId.values()]
  if (follows.some((follow) => follow.blogUrl === url)) {
    throw new Error('Already following that blog.')
  }
  await waitForRemoteStore()
  // Resolve before storing: a URL that answers with a blog document is the
  // only evidence the follow will ever work, and it costs one GET.
  const blog = await fetchBlog(url)
  if (!blog || blog.type !== 'Blog') {
    throw new Error('No public blog document at that URL.')
  }
  const now = new Date().toISOString()
  await useFollows.getState().insert({
    id: crypto.randomUUID(),
    type: 'Follow',
    blogUrl: url,
    name: blog.name,
    followedAt: now,
  })
}

/**
 * Lists a public posts collection and reads every post in it. The listing
 * yields summaries rather than bodies, so this is list-then-read; `item.url`
 * arrives root-relative (`/space/...`), which resolves against the collection
 * URL's origin.
 *
 * `publicListCollectionItems` follows the server's `next` links itself, so
 * pagination needs no handling here.
 *
 * @param postsUrl {string}   absolute collection URL
 * @returns {Promise<BlogPost[]>}
 */
export async function fetchPosts(postsUrl: string): Promise<BlogPost[]> {
  const { was } = requireRemoteStore()
  const posts: BlogPost[] = []

  for await (const item of was.publicListCollectionItems({ collectionUrl: postsUrl })) {
    if (item.contentType && !item.contentType.includes('json')) {
      continue
    }
    const post = await readPublicJson<BlogPost>(new URL(item.url, postsUrl).toString())
    if (post?.type === 'BlogPost') {
      posts.push(post)
    }
  }
  return posts
}

/**
 * Walks every follow and merges the results into one reverse-chronological
 * timeline. Follows are fetched concurrently and settled independently, so a
 * dead host costs its own row and nothing else.
 *
 * The returned posts are deliberately NOT written into `usePosts`: that store
 * is backed by the local replica, which the sync controller pushes to YOUR
 * Space -- putting someone else's posts in it would republish them under your
 * own identity. Followed content stays read-only and in memory.
 *
 * @param follows {Follow[]}
 * @returns {Promise<{ items: FeedItem[], errors: FeedError[] }>}
 */
export async function loadFeed(
  follows: Follow[]
): Promise<{ items: FeedItem[]; errors: FeedError[] }> {
  if (follows.length === 0) {
    return { items: [], errors: [] }
  }
  // Same bootstrap race as the blog document: the public verbs below borrow
  // the session's client, which only exists once replication has started.
  await waitForRemoteStore()

  const settled = await Promise.allSettled(
    follows.map(async (follow) => {
      const blog = await fetchBlog(follow.blogUrl)
      if (!blog) {
        throw new Error('Blog document is missing or not public.')
      }
      const posts = await fetchPosts(blog.postsUrl)
      return posts.map((post) => ({
        post,
        blogName: blog.name,
        blogUrl: follow.blogUrl,
      }))
    })
  )

  const items: FeedItem[] = []
  const errors: FeedError[] = []

  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      items.push(...result.value)
    } else {
      errors.push({
        blogUrl: follows[index].blogUrl,
        message:
          result.reason instanceof Error ? result.reason.message : String(result.reason),
      })
    }
  })

  items.sort((a, b) => b.post.publishedAt.localeCompare(a.post.publishedAt))
  return { items, errors }
}
