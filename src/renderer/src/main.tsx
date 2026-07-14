import React from 'react'
import { createRoot } from 'react-dom/client'
import { Overlay } from './Overlay'
import { Settings } from '@renderer/features/settings/Settings'
import { About } from '@renderer/features/about/About'

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root not found')

const route = window.location.hash.replace('#', '')
const view = route === 'settings' ? <Settings /> : route === 'about' ? <About /> : <Overlay />

createRoot(container).render(<React.StrictMode>{view}</React.StrictMode>)
