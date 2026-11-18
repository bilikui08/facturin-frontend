import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './App'
import { applyTheme, getStoredTheme } from './lib/theme'
import './index.css'

// Antes de renderizar, para que no parpadee el tema claro si el usuario eligió el oscuro
applyTheme(getStoredTheme())

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('No se encontró el elemento #root')
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
