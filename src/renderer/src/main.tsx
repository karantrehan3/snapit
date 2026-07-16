import React, { lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { Overlay } from './Overlay'
import { Settings } from '@renderer/features/settings/Settings'
import { About } from '@renderer/features/about/About'

// Lazy so the editor's Konva bundle (~1.4 MB) loads only for the #edit window and
// never bloats the shared entry chunk that the overlay/settings/about windows load.
const ImageEditor = lazy(() =>
  import('@renderer/features/edit/ImageEditor').then((m) => ({ default: m.ImageEditor }))
)

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root not found')

const route = window.location.hash.replace('#', '')
const view =
  route === 'settings' ? (
    <Settings />
  ) : route === 'about' ? (
    <About />
  ) : route === 'edit' ? (
    <Suspense fallback={null}>
      <ImageEditor />
    </Suspense>
  ) : (
    <Overlay />
  )

createRoot(container).render(<React.StrictMode>{view}</React.StrictMode>)
