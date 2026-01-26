import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Create a host element for our extension overlay
const appHostId = 'veil-crawler-extension-root';
let hostElement = document.getElementById(appHostId);

if (!hostElement) {
  hostElement = document.createElement('div');
  hostElement.id = appHostId;
  // Ensure our container sits on top of everything but lets clicks pass through (pointer-events-none default)
  hostElement.style.position = 'fixed';
  hostElement.style.top = '0';
  hostElement.style.left = '0';
  hostElement.style.width = '100vw';
  hostElement.style.height = '100vh';
  hostElement.style.zIndex = '2147483647'; // Max safe z-index
  hostElement.style.pointerEvents = 'none'; // IMPORTANT: Allow interaction with the page below by default
  document.body.appendChild(hostElement);
}

const root = ReactDOM.createRoot(hostElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);