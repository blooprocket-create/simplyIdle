import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../ui/theme/tokens.css';
import '../ui/theme/reset.css';
import { App } from './App';

const host = document.getElementById('root');
if (!host) throw new Error('No #root element to mount into.');

createRoot(host).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
