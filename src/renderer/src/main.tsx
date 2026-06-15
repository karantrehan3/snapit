import React from 'react'
import { createRoot } from 'react-dom/client'
import { Overlay } from './Overlay'
import { Settings } from '@renderer/features/settings/Settings'

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root not found')

const isSettings = window.location.hash.replace('#', '') === 'settings'

createRoot(container).render(<React.StrictMode>{isSettings ? <Settings /> : <Overlay />}</React.StrictMode>)
