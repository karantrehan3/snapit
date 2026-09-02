import React, { lazy, Suspense } from 'react'
import './styles/tokens.css'
import { createRoot } from 'react-dom/client'
import { Overlay } from './Overlay'
import { Welcome } from '@renderer/features/welcome/Welcome'

/**
 * One renderer bundle, four windows.
 *
 * `#home` is the application: the shell, with every section inside it. Settings and
 * About used to be routes here and windows of their own — they are routes of the shell
 * now, so this file no longer knows about them.
 *
 * What is left a window is what has to be: the capture overlay (transparent,
 * click-through, created once and reused), first run (shown before there is an app to be
 * inside), and the image editor (a document with its own undo stack).
 */

// Lazy so the editor's Konva bundle (~1.4 MB) loads only for the #edit window and never
// bloats the shared entry chunk the overlay loads.
const ImageEditor = lazy(() =>
  import('@renderer/features/edit/ImageEditor').then((m) => ({ default: m.ImageEditor }))
)
// Lazy too: the shell pulls in every route, and the capture overlay must not carry it.
const Shell = lazy(() => import('@renderer/features/shell/Shell').then((m) => ({ default: m.Shell })))
// Development-only surface, so it must never weigh on a window someone actually opens.
const Gallery = lazy(() => import('@renderer/features/gallery/Gallery').then((m) => ({ default: m.Gallery })))

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root not found')

const route = window.location.hash.replace('#', '')
// `home/<section>` opens the shell on that section; `home` opens it on Overview.
const isShell = route === 'home' || route.startsWith('home/')

const view =
  route === 'welcome' ? (
    <Welcome />
  ) : isShell ? (
    <Suspense fallback={null}>
      <Shell />
    </Suspense>
  ) : route === 'gallery' ? (
    <Suspense fallback={null}>
      <Gallery />
    </Suspense>
  ) : route === 'edit' ? (
    <Suspense fallback={null}>
      <ImageEditor />
    </Suspense>
  ) : (
    <Overlay />
  )

createRoot(container).render(<React.StrictMode>{view}</React.StrictMode>)
