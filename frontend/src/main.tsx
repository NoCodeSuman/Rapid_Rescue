import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { backendApi } from './lib/backendApi';

// Check the separately running API without blocking the UI if the backend is offline.
void backendApi.health().then((health) => {
  console.info(`${health.service} connected`);
}).catch(() => {
  // The UI remains usable in local/offline mode when the API is not running.
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
