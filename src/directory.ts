import { requireRemoteStore } from '@interop/was-react'

/**
 * The server's opt-in blog directory: the list behind the Discover page.
 *
 * The directory holds nothing but URLs. Listing it is an unsigned GET any
 * visitor could make; joining and leaving are signed with this session's key,
 * which the server checks against the `signingKey` the blog document
 * publishes -- so only the blog's own app can list it or take it down.
 *
 * Callers wait for the remote store first (`waitForRemoteStore`); every
 * function here reads the server URL from it.
 */

const DIRECTORY_PATH = '/directory/blogs'

/** A stop for a runaway `next` chain, far past any directory this app will meet. */
const MAX_PAGES = 20

export interface DirectoryEntry {
  blogUrl: string
  addedAt: string
}

/** The error a server without the directory feature earns. */
const NO_DIRECTORY = 'This server does not run a blog directory.'

/**
 * @returns {string}
 */
function directoryUrl(): string {
  return `${requireRemoteStore().serverUrl}${DIRECTORY_PATH}`
}

/**
 * The HTTP status carried by a failed signed request, whichever of the
 * client's two error shapes it arrived in.
 *
 * @param err {unknown}
 * @returns {number | undefined}
 */
function statusOf(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) {
    return undefined
  }
  const candidate = err as { status?: number; response?: { status?: number } }
  return candidate.status ?? candidate.response?.status
}

/**
 * Every listed blog, following the directory's `next` links.
 *
 * @returns {Promise<DirectoryEntry[]>}
 */
export async function listDirectory(): Promise<DirectoryEntry[]> {
  const { serverUrl } = requireRemoteStore()
  const entries: DirectoryEntry[] = []
  let next: string | undefined = DIRECTORY_PATH
  for (let page = 0; next !== undefined && page < MAX_PAGES; page++) {
    const response = await fetch(new URL(next, serverUrl))
    if (response.status === 404) {
      throw new Error(NO_DIRECTORY)
    }
    if (!response.ok) {
      throw new Error(`The blog directory answered ${response.status}.`)
    }
    const body = (await response.json()) as { items: DirectoryEntry[]; next?: string }
    entries.push(...body.items)
    next = body.next
  }
  return entries
}

/**
 * Waits until the blog document answers publicly. The server reads it from
 * its own storage before listing it, and a blog created moments ago may not
 * have been pushed there by sync yet.
 *
 * @param url {string}
 * @param [options] {object}
 * @param [options.timeoutMs] {number}
 * @param [options.intervalMs] {number}
 * @returns {Promise<void>}
 */
async function waitUntilPublic(
  url: string,
  { timeoutMs = 20000, intervalMs = 1000 }: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<void> {
  const { was } = requireRemoteStore()
  const deadline = Date.now() + timeoutMs
  while ((await was.publicRead({ resourceUrl: url })) === null) {
    if (Date.now() >= deadline) {
      throw new Error('Your blog has not reached the server yet. Try again in a moment.')
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}

/**
 * Lists a blog. Adding one that is already listed is harmless.
 *
 * @param blogUrl {string}   the blog document's URL
 * @returns {Promise<void>}
 */
export async function joinDirectory(blogUrl: string): Promise<void> {
  await waitUntilPublic(blogUrl)
  try {
    await requireRemoteStore().was.request({
      url: directoryUrl(),
      method: 'POST',
      json: { blogUrl },
    })
  } catch (err) {
    if (statusOf(err) === 404) {
      throw new Error(NO_DIRECTORY)
    }
    throw err
  }
}

/**
 * Takes a blog off the directory. A blog that is not listed -- or a server
 * with no directory at all -- is already in the state asked for.
 *
 * @param blogUrl {string}   the blog document's URL
 * @returns {Promise<void>}
 */
export async function leaveDirectory(blogUrl: string): Promise<void> {
  try {
    await requireRemoteStore().was.request({
      url: directoryUrl(),
      method: 'DELETE',
      json: { blogUrl },
    })
  } catch (err) {
    if (statusOf(err) !== 404) {
      throw err
    }
  }
}
