
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { logger } from './utils/logger';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  logger.error('Root element not found');
  throw new Error("Could not find root element to mount to");
}

logger.info('Initializing postMONKEE application');

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
