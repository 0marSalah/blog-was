import { useEffect, useState } from 'react'
import { useFollows } from '../wasApp'
import { waitForRemoteStore } from '../blog'
import { fetchBlog, fetchPosts, followBlog } from '../feed'
import { Markdown } from '../markdown'
import type { Blog, BlogPost } from '../types'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

/**
 * One blog seen from outside: what a Discover card or a shared link opens.
 * It reads the same public documents a follower's feed does, so what shows
 * here is exactly what following gets you.
 *
 * Mounted with `key={blogUrl}`, so opening a different blog starts from a
 * fresh loading state rather than flashing the previous one.
 */
export function BlogPreview({
  blogUrl,
  ownBlogUrl,
  onBack,
}: {
  blogUrl: string
  ownBlogUrl?: string
  onBack: () => void
}) {
  const following = useFollows((state) =>
    [...state.byId.values()].some((follow) => follow.blogUrl === blogUrl)
  )
  const hydrateFollows = useFollows((state) => state.hydrate)

  const [blog, setBlog] = useState<Blog | null>(null)
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [followError, setFollowError] = useState<string | null>(null)
  const [followingNow, setFollowingNow] = useState(false)

  useEffect(() => {
    void hydrateFollows().catch((err) => {
      console.error('Failed to hydrate follows:', err)
    })
  }, [hydrateFollows])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        await waitForRemoteStore()
        const found = await fetchBlog(blogUrl)
        if (!found || found.type !== 'Blog') {
          throw new Error('There is no public blog at this link.')
        }
        const published = await fetchPosts(found.postsUrl)
        published.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
        if (!cancelled) {
          setBlog(found)
          setPosts(published)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [blogUrl])

  async function handleFollow() {
    setFollowingNow(true)
    setFollowError(null)
    try {
      await followBlog(blogUrl)
    } catch (err) {
      setFollowError(err instanceof Error ? err.message : String(err))
    } finally {
      setFollowingNow(false)
    }
  }

  const ownBlog = blogUrl === ownBlogUrl

  return (
    <Stack spacing={4} sx={{ maxWidth: '42rem', width: '100%', marginX: 'auto' }}>
      <Box>
        <Button size="small" color="inherit" onClick={onBack} sx={{ marginLeft: -1 }}>
          &larr; Discover
        </Button>
      </Box>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', paddingY: 8 }}>
          <CircularProgress size={28} />
        </Box>
      )}

      {error && <Alert severity="warning">{error}</Alert>}

      {blog && (
        <>
          <Box component="header">
            <Typography variant="h1" sx={{ textWrap: 'balance' }}>
              {blog.name}
            </Typography>
            {blog.description && (
              <Typography variant="body1" color="text.secondary" sx={{ marginTop: 1 }}>
                {blog.description}
              </Typography>
            )}

            <Box sx={{ marginTop: 2 }}>
              {ownBlog ? (
                <Typography variant="body2" color="text.secondary">
                  This is your blog, as readers see it.
                </Typography>
              ) : (
                <Button
                  variant={following ? 'outlined' : 'contained'}
                  size="small"
                  onClick={() => void handleFollow()}
                  disabled={following || followingNow}
                  sx={{ borderRadius: 999, paddingX: 2.5 }}
                >
                  {following ? 'Following' : followingNow ? 'Following...' : 'Follow'}
                </Button>
              )}
            </Box>

            {followError && (
              <Alert severity="error" sx={{ marginTop: 2 }}>
                {followError}
              </Alert>
            )}
          </Box>

          <Divider />

          {posts.length === 0 ? (
            <Box sx={{ paddingY: 4, textAlign: 'center' }}>
              <Typography variant="body1" color="text.secondary">
                Nothing published yet.
              </Typography>
            </Box>
          ) : (
            <Stack divider={<Divider />}>
              {posts.map((post) => (
                <Box component="article" key={post.url || post.id} sx={{ paddingY: 3.5 }}>
                  <Typography variant="h2" component="h2" sx={{ textWrap: 'balance' }}>
                    {post.title}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', marginTop: 1 }}
                  >
                    {new Date(post.publishedAt).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </Typography>
                  <Box sx={{ marginTop: 2 }}>
                    <Markdown source={post.content} />
                  </Box>
                </Box>
              ))}
            </Stack>
          )}
        </>
      )}
    </Stack>
  )
}
