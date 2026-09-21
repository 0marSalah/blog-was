import { useState } from 'react'
import { setDiscoverable } from '../blog'
import type { Blog } from '../types'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Typography from '@mui/material/Typography'

/**
 * The one-time question: should this blog be listed on the Discover page? It
 * stays open while the blog document has no answer recorded, so it is asked
 * once per blog rather than once per browser, and never again after either
 * answer. Both answers can be changed later from the blog page.
 */
export function DiscoverPrompt({
  blog,
  onBlogChange,
}: {
  blog: Blog
  onBlogChange: (blog: Blog) => void
}) {
  const [saving, setSaving] = useState<'yes' | 'no' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function answer(discoverable: boolean) {
    setSaving(discoverable ? 'yes' : 'no')
    setError(null)
    try {
      onBlogChange(await setDiscoverable({ discoverable }))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(null)
    }
  }

  return (
    <Dialog open={blog.discoverable === undefined} fullWidth maxWidth="xs">
      <DialogTitle>Show your blog on the Discover page?</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary">
          People browsing Discover will see your blog&rsquo;s name and
          description, and can follow you. If you say no, your blog stays
          reachable only through its link. You can change this later from your
          blog page.
        </Typography>
        {error && (
          <Alert severity="error" sx={{ marginTop: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ paddingX: 3, paddingBottom: 2 }}>
        <Button color="inherit" onClick={() => void answer(false)} disabled={saving !== null}>
          {saving === 'no' ? 'Saving...' : 'No, link only'}
        </Button>
        <Button variant="contained" onClick={() => void answer(true)} disabled={saving !== null}>
          {saving === 'yes' ? 'Adding...' : 'Yes, list it'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
