import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Missing #root element — index.html did not mount the app');
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>
);