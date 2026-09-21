import { useEffect, useState } from 'react'
import { waitForRemoteStore } from '../blog'
import { listDirectory } from '../directory'
import { fetchBlog } from '../feed'
import type { Blog } from '../types'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

/**
 * Blogs whose authors chose to be found. The server's directory holds only
 * URLs, so every card is read live from the blog's own document: a renamed
 * blog shows its new name, and one that no longer answers is left out rather
 * than shown stale.
 */
export function Discover({
  ownBlogUrl,
  onOpen,
}: {
  ownBlogUrl?: string
  onOpen: (blogUrl: string) => void
}) {
  const [blogs, setBlogs] = useState<Blog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        await waitForRemoteStore()
        const entries = (await listDirectory())
          .filter((entry) => entry.blogUrl !== ownBlogUrl)
          .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
        const settled = await Promise.allSettled(
          entries.map((entry) => fetchBlog(entry.blogUrl))
        )
        const found = settled.flatMap((result) =>
          result.status === 'fulfilled' && result.value?.type === 'Blog' ? [result.value] : []
        )
        if (!cancelled) {
          setBlogs(found)
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
  }, [ownBlogUrl])

  return (
    <Stack spacing={4} sx={{ maxWidth: '42rem', width: '100%', marginX: 'auto' }}>
      <Box component="header">
        <Typography variant="h1">Discover</Typography>
        <Typography variant="body1" color="text.secondary" sx={{ marginTop: 1 }}>
          Blogs whose authors chose to be listed here. Open one to read it and
          follow.
        </Typography>
      </Box>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', paddingY: 8 }}>
          <CircularProgress size={28} />
        </Box>
      )}

      {error && <Alert severity="warning">{error}</Alert>}

      {!loading && !error && blogs.length === 0 && (
        <Box sx={{ paddingY: 5, textAlign: 'center' }}>
          <Typography variant="body1" color="text.secondary">
            No one else has listed their blog yet.
          </Typography>
        </Box>
      )}

      <Stack spacing={1.5}>
        {blogs.map((blog) => (
          <ButtonBase
            key={blog.url}
            onClick={() => onOpen(blog.url)}
            sx={{
              display: 'block',
              textAlign: 'left',
              width: '100%',
              padding: 2.5,
              border: 1,
              borderColor: 'divider',
              borderRadius: 2,
              '&:hover': { borderColor: 'text.secondary' },
            }}
          >
            <Typography variant="h5" component="h2">
              {blog.name}
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ marginTop: 0.5, fontStyle: blog.description ? 'normal' : 'italic' }}
            >
              {blog.description ?? 'No description yet.'}
            </Typography>
          </ButtonBase>
        ))}
      </Stack>
    </Stack>
  )
}
