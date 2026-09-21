import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { DEFAULT_BLOG_NAME } from '../app.config'
import { usePosts } from '../wasApp'
import { setDiscoverable, shareLinkFor, updateBlog } from '../blog'
import type { Blog } from '../types'
import { Markdown } from '../markdown'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

/**
 * The author's own blog: how it introduces itself, and everything published
 * on it.
 *
 * Profile and blog are the same object here, not two. A follower resolves one
 * document and gets the name, the description and the address of the posts --
 * so editing "your profile" is editing that document, and there is no second
 * identity record to keep in step.
 *
 * The page shows the blog as a reader would see it and keeps editing behind a
 * dialog. An always-open form would make the first thing you see on your own
 * blog a set of input fields, which is the opposite of what a blog is for.
 */
export function Profile({
  blog,
  onBlogChange,
  onWrite,
}: {
  blog: Blog
  onBlogChange: (blog: Blog) => void
  onWrite: () => void
}) {
  const posts = usePosts(useShallow((state) => [...state.byId.values()]))
  const ordered = [...posts].sort((left, right) =>
    (right.publishedAt ?? '').localeCompare(left.publishedAt ?? '')
  )

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(blog.name)
  const [description, setDescription] = useState(blog.description ?? '')
  const [saving, setSaving] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [savingDiscover, setSavingDiscover] = useState(false)
  const [discoverError, setDiscoverError] = useState<string | null>(null)

  useEffect(() => {
    if (!copied) {
      return
    }
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  const unnamed = blog.name === DEFAULT_BLOG_NAME

  function openEditor() {
    // Re-seeded on open so a cancelled edit leaves nothing behind.
    setName(blog.name)
    setDescription(blog.description ?? '')
    setProfileError(null)
    setEditing(true)
  }

  async function handleSave() {
    setSaving(true)
    setProfileError(null)
    try {
      onBlogChange(await updateBlog({ name, description }))
      setEditing(false)
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleCopy() {
    const link = shareLinkFor(blog.url)
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      window.prompt('Copy your blog link:', link)
    }
  }

  async function handleDiscoverable(discoverable: boolean) {
    setSavingDiscover(true)
    setDiscoverError(null)
    try {
      onBlogChange(await setDiscoverable({ discoverable }))
    } catch (err) {
      setDiscoverError(err instanceof Error ? err.message : String(err))
    } finally {
      setSavingDiscover(false)
    }
  }

  return (
    <Stack spacing={4} sx={{ maxWidth: '42rem', width: '100%', marginX: 'auto' }}>
      <Box component="header">
        <Typography variant="h1" sx={{ textWrap: 'balance' }}>
          {blog.name}
        </Typography>
        {blog.description ? (
          <Typography variant="body1" color="text.secondary" sx={{ marginTop: 1 }}>
            {blog.description}
          </Typography>
        ) : (
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ marginTop: 1, fontStyle: 'italic', opacity: 0.7 }}
          >
            No description yet.
          </Typography>
        )}

        <Stack direction="row" spacing={1} sx={{ marginTop: 2, flexWrap: 'wrap' }}>
          <Button variant="outlined" size="small" onClick={openEditor}>
            Edit blog
          </Button>
          <Button variant="text" size="small" color="inherit" onClick={() => void handleCopy()}>
            {copied ? 'Link copied' : 'Copy link'}
          </Button>
        </Stack>

        <FormControlLabel
          sx={{ marginTop: 1.5 }}
          control={
            <Switch
              size="small"
              checked={blog.discoverable === true}
              onChange={(event) => void handleDiscoverable(event.target.checked)}
              disabled={savingDiscover}
            />
          }
          label={
            <Typography variant="body2" color="text.secondary">
              {savingDiscover ? 'Saving...' : 'Show on the Discover page'}
            </Typography>
          }
        />

        {discoverError && (
          <Alert severity="error" sx={{ marginTop: 1 }}>
            {discoverError}
          </Alert>
        )}

        {unnamed && (
          <Alert severity="info" sx={{ marginTop: 2 }}>
            Your blog is still called &ldquo;{DEFAULT_BLOG_NAME}&rdquo;. Anyone
            following you sees this name, so give it one of your own.
          </Alert>
        )}
      </Box>

      <Divider />

      {ordered.length === 0 ? (
        <Box sx={{ paddingY: 4, textAlign: 'center' }}>
          <Typography variant="body1" color="text.secondary">
            Nothing published yet.
          </Typography>
          <Button variant="contained" onClick={onWrite} sx={{ marginTop: 2, borderRadius: 999, paddingX: 2.5 }}>
            Write your first post
          </Button>
        </Box>
      ) : (
        // Rules rather than cards: consecutive posts are one column of
        // writing, and boxing each of them fights that reading.
        <Stack divider={<Divider />}>
          {ordered.map((post) => (
            <Box component="article" key={post.id} sx={{ paddingY: 3.5 }}>
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

      <Dialog open={editing} onClose={() => setEditing(false)} fullWidth maxWidth="sm">
        <DialogTitle>Edit blog</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ marginBottom: 2 }}>
            This is what people see when they follow you. Both fields are public.
          </Typography>
          <Stack spacing={2} sx={{ paddingTop: 1 }}>
            <TextField
              label="Blog name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              fullWidth
              autoFocus
            />
            <TextField
              label="Description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="A sentence about what you write here."
              fullWidth
              multiline
              minRows={2}
            />
            {profileError && <Alert severity="error">{profileError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ paddingX: 3, paddingBottom: 2 }}>
          <Button color="inherit" onClick={() => setEditing(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => void handleSave()}
            disabled={saving || !name.trim()}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
