import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './base.css'
import './layout.css'
import './scan.css'
import App from './App.jsx'
import { ThemeProvider, getActiveTheme, applyTheme } from './lib/theme'

// Early application before first component render
applyTheme(getActiveTheme());

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <HashRouter>
        <App />
      </HashRouter>
    </ThemeProvider>
  </StrictMode>,
)
