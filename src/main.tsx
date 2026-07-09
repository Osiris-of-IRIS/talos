// TALOS entry point. Decision IDs: ADR-0002, ADR-0020.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import { App } from './app/App';
import { renderBootError } from './app/bootError';
import { TALOS_CONFIG, validateConfig } from './config';
import { logger } from './shared/logger';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('TALOS: #root element not found in index.html');
}

const configErrors = validateConfig(TALOS_CONFIG);
if (configErrors.length > 0) {
  logger.error('Invalid runtime configuration — halting boot', ['ADR-0002'], {
    errors: configErrors,
  });
  renderBootError(rootEl, configErrors);
} else {
  logger.info('TALOS boot', ['ADR-0002']);
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
