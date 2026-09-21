import { useCallback, useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useFollows } from '../wasApp'
import { followBlog, loadFeed, type FeedError, type FeedItem } from '../feed'
import { Markdown } from '../markdown'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

/**
 * The follow feed -- Mastodon's Home timeline, minus the server.
 *
 * Following is one-directional and needs no consent: paste a blog URL, and
 * the reader resolves it, finds `postsUrl`, and pulls. The followed author is
 * never contacted and never learns about it.
 */
export function Feed() {
  const follows = useFollows(useShallow((state) => [...state.byId.values()]))
  const removeFollow = useFollows((state) => state.remove)
  const hydrateFollows = useFollows((state) => state.hydrate)

  const [items, setItems] = useState<FeedItem[]>([])
  const [errors, setErrors] = useState<FeedError[]>([])
  const [blogUrl, setBlogUrl] = useState('')
  const [adding, setAdding] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void hydrateFollows().catch((err) => {
      console.error('Failed to hydrate follows:', err)
    })
  }, [hydrateFollows])

  // No synchronous state update here: the pull is the external system, and
  // everything this sets lands after the await.
  const refresh = useCallback(async () => {
    const result = await loadFeed(follows)
    setItems(result.items)
    setErrors(result.errors)
    setLoading(false)
  }, [follows])

  // Re-pull whenever the follow set changes. There is no push side, so this
  // and the refresh button are the only things that make the timeline move.
  useEffect(() => {
    // The rule reads `refresh` as setting state synchronously; every one of
    // its updates lands after an await, which the static walk cannot see.
    // eslint-disable-next-line react/set-state-in-effect
    void refresh()
  }, [refresh])

  async function handleRefresh() {
    setLoading(true)
    await refresh()
  }

  async function handleFollow(event: React.FormEvent) {
    event.preventDefault()
    setAdding(true)
    setError(null)
    try {
      await followBlog(blogUrl)
      setBlogUrl('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setAdding(false)
    }
  }

  return (
    <Stack spacing={4} sx={{ maxWidth: '42rem', width: '100%', marginX: 'auto' }}>
      <Box component="header">
        <Typography variant="h1">Reading</Typography>
        <Typography variant="body1" color="text.secondary" sx={{ marginTop: 1 }}>
          Posts from the blogs you follow, read straight from wherever their
          authors keep them.
        </Typography>

        <Stack
          component="form"
          onSubmit={handleFollow}
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          sx={{ marginTop: 3 }}
        >
          <TextField
            placeholder="Paste a blog link to follow"
            value={blogUrl}
            onChange={(event) => setBlogUrl(event.target.value)}
            required
            size="small"
            fullWidth
          />
          <Button
            type="submit"
            variant="contained"
            disabled={adding}
            sx={{ borderRadius: 999, paddingX: 2.5, flexShrink: 0 }}
          >
            {adding ? 'Adding...' : 'Follow'}
          </Button>
        </Stack>

        {error && (
          <Alert severity="error" sx={{ marginTop: 2 }}>
            {error}
          </Alert>
        )}

        {follows.length > 0 && (
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', marginTop: 2 }}>
            {follows.map((follow) => (
              <Chip
                key={follow.id}
                label={follow.name ?? follow.blogUrl}
                onDelete={() => void removeFollow(follow.id)}
                size="small"
                variant="outlined"
              />
            ))}
          </Stack>
        )}
      </Box>

      {errors.map((feedError) => (
        <Alert severity="warning" key={feedError.blogUrl}>
          Could not read {feedError.blogUrl} -- {feedError.message}
        </Alert>
      ))}

      <Divider />

      <Box>
        <Stack
          direction="row"
          sx={{ justifyContent: 'space-between', alignItems: 'center' }}
        >
          <Typography variant="h5" component="h2" color="text.secondary">
            Timeline
          </Typography>
          <Button
            size="small"
            color="inherit"
            onClick={() => void handleRefresh()}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
        </Stack>

        {follows.length === 0 && (
          <Box sx={{ paddingY: 5, textAlign: 'center' }}>
            <Typography variant="body1" color="text.secondary">
              You are not following anyone yet.
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ marginTop: 1, opacity: 0.8 }}>
              Find blogs on Discover, or paste a link someone sent you above.
            </Typography>
          </Box>
        )}

        {follows.length > 0 && items.length === 0 && !loading && (
          <Box sx={{ paddingY: 5, textAlign: 'center' }}>
            <Typography variant="body1" color="text.secondary">
              Nothing published yet by anyone you follow.
            </Typography>
          </Box>
        )}

        <Stack divider={<Divider />}>
          {items.map((item) => (
            <Box component="article" key={item.post.url || item.post.id} sx={{ paddingY: 3.5 }}>
              {/* Attribution leads, because a merged timeline's first question
                  is always whose writing this is. */}
              <Typography
                variant="caption"
                sx={{ display: 'block', color: 'primary.main', letterSpacing: '0.08em' }}
              >
                {item.blogName}
              </Typography>
              <Typography variant="h2" component="h3" sx={{ marginTop: 0.5, textWrap: 'balance' }}>
                {item.post.title}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', marginTop: 1 }}
              >
                {new Date(item.post.publishedAt).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </Typography>
              <Box sx={{ marginTop: 2 }}>
                <Markdown source={item.post.content} />
              </Box>
            </Box>
          ))}
        </Stack>
      </Box>
    </Stack>
  )
}
