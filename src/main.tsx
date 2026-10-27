import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import { registerSW } from 'virtual:pwa-register'

const updateSW = registerSW({
  onNeedRefresh() {
    window.dispatchEvent(new Event('app-update-available'))
  },
})
window.addEventListener('app-update-request', () => void updateSW(true))

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
