import { hasRemoteStore, publicUrlFor, requireRemoteStore } from '@interop/was-react'
import { BLOG_ID, BLOG_LINK_PARAM } from './app.config'
import { joinDirectory, leaveDirectory } from './directory'
import { useBlogs } from './wasApp'
import type { Blog } from './types'

/**
 * The blog's identity: a public document a reader can fetch, plus the two
 * URLs that make it followable.
 *
 * A post used to carry `author: controllerDid` -- the app's seed-derived
 * `did:key`. That was wrong twice over: the key is scoped to (user, origin,
 * appUrl), so it names this app rather than the person, and a `did:key`
 * document is just the public key restated, so a follower resolving it finds
 * no address to fetch. Identity here is a URL, the way ActivityPub does it,
 * and the key goes back to being only a key.
 */

/**
 * Waits for the sync bootstrap to install the remote store.
 *
 * `status: 'connected'` does NOT mean the remote store exists yet: the auth
 * store kicks replication off in the background and writes `connected`
 * immediately, deliberately, so a down server never blocks entry to the app.
 * The store lands at the end of that background task, so anything reading the
 * space topology (every URL below) has to wait for it rather than assume it.
 *
 * A timeout here means the bootstrap failed outright -- server unreachable, or
 * the session's grants do not cover the configured collections -- rather than
 * that it is merely slow.
 *
 * @param options {object}
 * @param [options.timeoutMs] {number}
 * @param [options.intervalMs] {number}
 * @returns {Promise<void>}
 */
export async function waitForRemoteStore({
  timeoutMs = 15000,
  intervalMs = 250,
}: { timeoutMs?: number; intervalMs?: number } = {}): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!hasRemoteStore()) {
    if (Date.now() >= deadline) {
      throw new Error(
        'Timed out waiting for WAS replication to start. The server may be ' +
          'unreachable, or this session may predate the collections this app ' +
          'now declares -- signing out and back in re-requests them.'
      )
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}

/**
 * The blog document's own world-readable URL. Pure string composition (space
 * + collection + document id), so it is safe to call BEFORE the document
 * exists -- which is what lets the document carry its own address.
 *
 * @returns {string}
 */
export function blogUrl(): string {
  return publicUrlFor({ collectionKey: 'blogs', id: BLOG_ID })
}

/**
 * The public `posts` collection URL: what a follower lists to read the posts.
 * `publicUrlFor` addresses a single resource, so the collection URL is
 * composed from the same topology the remote store already holds.
 *
 * @returns {string}
 */
export function postsUrl(): string {
  const { serverUrl, spaceId } = requireRemoteStore()
  return `${serverUrl}/space/${spaceId}/posts`
}

/**
 * The space this session actually resolved to. Read from the live remote
 * store rather than from config, because the app never chooses it: the server
 * URL and space id both arrive inside the wallet's grants.
 *
 * @returns {{ serverUrl: string, spaceId: string }}
 */
export function spaceTopology(): { serverUrl: string; spaceId: string } {
  const { serverUrl, spaceId } = requireRemoteStore()
  return { serverUrl, spaceId }
}

/**
 * The link to hand a person: this app, opened on the blog's preview. The raw
 * document URL answers with JSON, which only a program wants.
 *
 * @param url {string}   the blog document's URL
 * @returns {string}
 */
export function shareLinkFor(url: string): string {
  const link = new URL(import.meta.env.BASE_URL, window.location.origin)
  link.searchParams.set(BLOG_LINK_PARAM, url)
  return link.href
}

/**
 * Reads the blog document this session owns, after waiting for the stores it
 * lives in.
 *
 * @returns {Promise<Blog>}
 */
async function currentBlog(): Promise<Blog> {
  await waitForRemoteStore()
  await useBlogs.getState().hydrate()
  const existing = useBlogs.getState().byId.get(BLOG_ID)
  if (!existing) {
    throw new Error('There is no blog document to update yet.')
  }
  return existing
}

/**
 * Saves the author-editable half of the blog document. Everything else --
 * the URLs, the signing key, `createdAt` -- is composed or fixed, and is
 * carried over untouched.
 *
 * No conflict handling here, unlike `ensureBlog`: this runs only against a
 * document the caller is already looking at, so `upsert` takes the update
 * branch rather than racing to create.
 *
 * @param options {object}
 * @param options.name {string}
 * @param [options.description] {string}
 * @returns {Promise<Blog>}
 */
export async function updateBlog({
  name,
  description,
}: {
  name: string
  description?: string
}): Promise<Blog> {
  const existing = await currentBlog()

  const trimmed = description?.trim()
  const updated: Blog = {
    ...existing,
    name: name.trim(),
    // Dropped rather than stored empty, so "no description" is one state in
    // the published JSON instead of two a reader would have to handle.
    description: trimmed ? trimmed : undefined,
    updatedAt: new Date().toISOString(),
  }

  await useBlogs.getState().upsert(updated)
  return updated
}

/**
 * Records the author's answer to "show this blog on the Discover page?" --
 * on the server's directory first, then on the blog document. In that order
 * so the document never claims a listing the directory refused: a failure
 * leaves the old answer (or no answer) in place.
 *
 * @param options {object}
 * @param options.discoverable {boolean}
 * @returns {Promise<Blog>}
 */
export async function setDiscoverable({
  discoverable,
}: {
  discoverable: boolean
}): Promise<Blog> {
  const existing = await currentBlog()
  if (discoverable) {
    await joinDirectory(existing.url)
  } else if (existing.discoverable) {
    await leaveDirectory(existing.url)
  }

  const updated: Blog = {
    ...existing,
    discoverable,
    updatedAt: new Date().toISOString(),
  }
  await useBlogs.getState().upsert(updated)
  return updated
}

/**
 * Whether a write failed because the document already existed. RxDB raises
 * this as `code: 'CONFLICT'`; the underlying storage write carries HTTP 409.
 * Both are checked because only the first is part of RxDB's documented shape.
 *
 * @param err {unknown}
 * @returns {boolean}
 */
function isWriteConflict(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) {
    return false
  }
  const candidate = err as {
    code?: string
    parameters?: { writeError?: { status?: number } }
  }
  return candidate.code === 'CONFLICT' || candidate.parameters?.writeError?.status === 409
}

/**
 * The in-flight `ensureBlog` call, keyed by signing key so that a session
 * change is never served a previous identity's promise.
 *
 * `upsert` routes insert-vs-update off the hydration index, which makes
 * `ensureBlog` a check-then-act sequence: two concurrent calls both read an
 * empty index, both take the insert branch, and the loser gets a CONFLICT on a
 * document that was created correctly a millisecond earlier. React's
 * `StrictMode` does exactly this in development -- it mounts, runs the effect,
 * unmounts, and mounts again -- and the effect's `cancelled` flag does not
 * help, since it suppresses the state update but not the request already in
 * flight.
 */
let inFlight: { signingKey: string; promise: Promise<Blog> } | null = null

/**
 * Creates the blog document on first run, and refreshes its URLs on every
 * later run (the space is fixed per identity, but re-composing keeps the
 * document honest if the server URL ever changes). Existing `name`,
 * `description`, `discoverable` and `createdAt` survive.
 *
 * Concurrency-safe in two layers, because the two races are different: callers
 * in THIS tab share one in-flight promise, while a genuine cross-context race
 * (a second tab, another device) can only be caught after the fact, by
 * treating the conflict as success and adopting the document that won.
 *
 * @param options {object}
 * @param options.name {string}   used only when the document does not exist
 * @param options.signingKey {string}   the session's `did:key`
 * @returns {Promise<Blog>}
 */
export function ensureBlog(options: { name: string; signingKey: string }): Promise<Blog> {
  if (inFlight && inFlight.signingKey === options.signingKey) {
    return inFlight.promise
  }
  // Cleared on settle rather than cached: this is a de-duplication window for
  // concurrent callers, not a result cache. A later call must re-read, since
  // the document may have changed in between.
  const promise = openBlog(options).finally(() => {
    if (inFlight?.promise === promise) {
      inFlight = null
    }
  })
  inFlight = { signingKey: options.signingKey, promise }
  return promise
}

/**
 * The body of {@link ensureBlog}, without the de-duplication.
 *
 * @param options {object}
 * @param options.name {string}
 * @param options.signingKey {string}
 * @returns {Promise<Blog>}
 */
async function openBlog({
  name,
  signingKey,
}: {
  name: string
  signingKey: string
}): Promise<Blog> {
  await waitForRemoteStore()
  await useBlogs.getState().hydrate()
  const existing = useBlogs.getState().byId.get(BLOG_ID)
  const now = new Date().toISOString()

  const blog: Blog = {
    id: BLOG_ID,
    type: 'Blog',
    name: existing?.name ?? name,
    description: existing?.description,
    discoverable: existing?.discoverable,
    url: blogUrl(),
    postsUrl: postsUrl(),
    signingKey,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  try {
    await useBlogs.getState().upsert(blog)
  } catch (err) {
    if (!isWriteConflict(err)) {
      throw err
    }
    // Someone created the document between our read and our write. That is the
    // outcome this function wanted, so adopt theirs rather than fight for the
    // write: the two differ only in timestamps, and a retry loop here would
    // just be two writers overwriting each other with equivalent content.
    await useBlogs.getState().hydrate()
    const winner = useBlogs.getState().byId.get(BLOG_ID)
    if (!winner) {
      throw err
    }
    return winner
  }
  return blog
}
