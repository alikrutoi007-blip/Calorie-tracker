import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

const shouldRegisterServiceWorker = 'serviceWorker' in navigator
  && (import.meta.env.PROD || !['localhost', '127.0.0.1'].includes(window.location.hostname))

if (shouldRegisterServiceWorker) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('Service worker registration failed', error)
    })
  })
}
