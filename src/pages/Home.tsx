import { useEffect, useState } from 'react'
import { useLogout, useSession } from '@interop/was-react'
import {
  BLOG_ID,
  BLOG_LINK_PARAM,
  DEFAULT_BLOG_NAME,
  EXPECTED_SERVER_URL,
} from '../app.config'
import { usePosts } from '../wasApp'
import { ensureBlog, spaceTopology, waitForRemoteStore } from '../blog'
import type { Blog } from '../types'
import Alert from '@mui/material/Alert'
import AppBar from '@mui/material/AppBar'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Container from '@mui/material/Container'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import { BlogPreview } from './BlogPreview'
import { Compose } from './Compose'
import { Discover } from './Discover'
import { DiscoverPrompt } from './DiscoverPrompt'
import { Feed } from './Feed'
import { Profile } from './Profile'

type View = 'blog' | 'reading' | 'discover' | 'preview' | 'write'

/**
 * The blog a share link (`?blog=<url>`) opened the app on, if any.
 *
 * @returns {string | null}
 */
function linkedBlogUrl(): string | null {
  return new URLSearchParams(window.location.search).get(BLOG_LINK_PARAM)
}

/**
 * The signed-in shell: a masthead bar, the views, and the one piece of
 * bootstrap all of them depend on -- the blog document.
 *
 * The chrome is deliberately thin. Everything this app does that a reader
 * would call unusual -- signing keys, server URLs, capability grants -- is
 * true but not interesting to someone who came here to write, so it lives in
 * the account menu rather than at the top of the page. What is left on screen
 * is a name, a nav, and a Write button.
 */
export function Home() {
  const { controllerDid } = useSession()
  const logout = useLogout()
  const query = usePosts((state) => state.query)
  const patch = usePosts((state) => state.patch)

  const [previewUrl, setPreviewUrl] = useState<string | null>(linkedBlogUrl)
  const [view, setView] = useState<View>(() => (linkedBlogUrl() ? 'preview' : 'blog'))
  const [blog, setBlog] = useState<Blog | null>(null)
  const [blogError, setBlogError] = useState<string | null>(null)
  const [serverUrl, setServerUrl] = useState<string | null>(null)
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)

  // The share link has done its job once the preview is open; left in the
  // address bar, it would reopen the same preview on every reload.
  useEffect(() => {
    const current = new URL(window.location.href)
    if (current.searchParams.has(BLOG_LINK_PARAM)) {
      current.searchParams.delete(BLOG_LINK_PARAM)
      window.history.replaceState(null, '', current)
    }
  }, [])

  // The blog document has to exist before a post can point at it: a post is
  // attributed to the blog's URL, and that URL is only meaningful once
  // something answers at it.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        // Waits on the sync bootstrap internally: `connected` is written
        // before the remote store exists.
        const opened = await ensureBlog({
          name: DEFAULT_BLOG_NAME,
          signingKey: controllerDid ?? '',
        })
        if (cancelled) {
          return
        }
        setBlog(opened)
        setServerUrl(spaceTopology().serverUrl)
        setBlogError(null)
      } catch (err) {
        if (!cancelled) {
          setBlogError(err instanceof Error ? err.message : String(err))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [controllerDid])

  // Background sync eventually pulls every post down, but a query reads the
  // Space directly -- render what's actually there now rather than wait on
  // that first pull to land. Kept here so switching views does not re-run it.
  useEffect(() => {
    void (async () => {
      try {
        await waitForRemoteStore()
        const { docs } = await query({ equals: { blogId: BLOG_ID } })
        for (const doc of docs) {
          patch(doc)
        }
      } catch (err) {
        console.error('Failed to load posts from the Space:', err)
      }
    })()
  }, [query, patch])

  function openPreview(blogUrl: string) {
    setPreviewUrl(blogUrl)
    setView('preview')
  }

  const title = blog?.name ?? 'Blog'

  return (
    <Box sx={{ minHeight: '100vh', backgroundColor: 'background.default' }}>
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          backgroundColor: 'background.default',
          backgroundImage: 'none',
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Container maxWidth="md" sx={{ paddingX: { xs: 2, sm: 3 } }}>
          <Toolbar disableGutters sx={{ gap: 1, minHeight: { xs: 60, sm: 68 } }}>
            <Typography
              variant="h4"
              component="button"
              onClick={() => setView('blog')}
              sx={{
                background: 'none',
                border: 0,
                padding: 0,
                cursor: 'pointer',
                color: 'text.primary',
                textAlign: 'left',
                maxWidth: { xs: '9rem', sm: '18rem' },
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {title}
            </Typography>

            <Box sx={{ flexGrow: 1 }} />

            <NavLink label="Your blog" active={view === 'blog'} onClick={() => setView('blog')} />
            <NavLink label="Reading" active={view === 'reading'} onClick={() => setView('reading')} />
            <NavLink
              label="Discover"
              active={view === 'discover' || view === 'preview'}
              onClick={() => setView('discover')}
            />

            <Button
              variant="contained"
              size="small"
              onClick={() => setView('write')}
              sx={{ marginLeft: 1, borderRadius: 999, paddingX: 2 }}
            >
              Write
            </Button>

            <IconButton
              onClick={(event) => setMenuAnchor(event.currentTarget)}
              aria-label="Account"
              sx={{ marginLeft: 0.5 }}
            >
              <Avatar
                sx={{
                  width: 30,
                  height: 30,
                  fontSize: '0.85rem',
                  bgcolor: 'primary.main',
                  color: 'background.default',
                }}
              >
                {title.trim().charAt(0).toUpperCase()}
              </Avatar>
            </IconButton>
          </Toolbar>
        </Container>
      </AppBar>

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
        slotProps={{ paper: { sx: { minWidth: 260, marginTop: 1 } } }}
      >
        {/* The details that make this a WAS app rather than a blog engine.
            Available, checkable, and out of the way. */}
        <Box sx={{ paddingX: 2, paddingY: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            Signed in with your wallet
          </Typography>
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              marginTop: 0.5,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              wordBreak: 'break-all',
              color: 'text.secondary',
            }}
          >
            {controllerDid}
          </Typography>
          {serverUrl && (
            <Typography
              variant="caption"
              sx={{
                display: 'block',
                marginTop: 0.5,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                color: 'text.secondary',
              }}
            >
              {serverUrl}
            </Typography>
          )}
        </Box>
        <Divider />
        <MenuItem
          onClick={() => {
            setMenuAnchor(null)
            logout()
          }}
        >
          Sign out
        </MenuItem>
      </Menu>

      <Container maxWidth="md" sx={{ paddingX: { xs: 2, sm: 3 }, paddingY: 5 }}>
        <Stack spacing={3}>
          {serverUrl && serverUrl !== EXPECTED_SERVER_URL && (
            <Alert severity="error">
              This session is on <strong>{serverUrl}</strong>, not{' '}
              {EXPECTED_SERVER_URL}. The server comes from the wallet's grants
              and is frozen into the stored session. Sign out and sign in again
              with the wallet pointed at {EXPECTED_SERVER_URL}.
            </Alert>
          )}

          {blogError && (
            <Alert severity="warning">
              Could not open your blog: {blogError}
              {blogError.includes('No delegated capability') && (
                <>
                  {' '}
                  Your wallet grants access per collection when you sign in, and
                  this session predates two of them. Sign out and back in to pick
                  them up.
                </>
              )}
            </Alert>
          )}

          {!blog && !blogError && (
            <Box sx={{ display: 'flex', justifyContent: 'center', paddingY: 8 }}>
              <CircularProgress size={28} />
            </Box>
          )}

          {view === 'reading' && <Feed />}

          {view === 'discover' && <Discover ownBlogUrl={blog?.url} onOpen={openPreview} />}

          {view === 'preview' && previewUrl && (
            <BlogPreview
              key={previewUrl}
              blogUrl={previewUrl}
              ownBlogUrl={blog?.url}
              onBack={() => setView('discover')}
            />
          )}

          {blog && view === 'blog' && (
            <Profile blog={blog} onBlogChange={setBlog} onWrite={() => setView('write')} />
          )}

          {blog && view === 'write' && (
            <Compose blog={blog} onDone={() => setView('blog')} />
          )}
        </Stack>
      </Container>

      {blog && <DiscoverPrompt blog={blog} onBlogChange={setBlog} />}
    </Box>
  )
}

/**
 * One item in the masthead nav. A text button rather than a `Tab`, because
 * tabs read as panels within a page and these are the pages.
 *
 * @param props {object}
 * @param props.label {string}
 * @param props.active {boolean}
 * @param props.onClick {function}
 */
function NavLink({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <Button
      onClick={onClick}
      sx={{
        display: { xs: 'none', sm: 'inline-flex' },
        color: active ? 'text.primary' : 'text.secondary',
        fontWeight: active ? 600 : 400,
        '&:hover': { backgroundColor: 'transparent', color: 'text.primary' },
      }}
    >
      {label}
    </Button>
  )
}
