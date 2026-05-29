import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { initLogger } from './utils/logger.js';
import './index.css';

// Capture uncaught errors / rejections and (optionally) ship them to a
// collector configured via VITE_LOG_ENDPOINT (improvement #13).
initLogger({
  endpoint: import.meta.env?.VITE_LOG_ENDPOINT || '',
  version: import.meta.env?.VITE_APP_VERSION || 'dev',
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);

if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {});
  });
}
