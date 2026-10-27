import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';

// Prevent accidental mouse wheel scrolling / incrementing on number inputs
window.addEventListener(
  'wheel',
  (e: WheelEvent) => {
    const target = e.target as HTMLElement | null;
    if (
      target &&
      target instanceof HTMLInputElement &&
      target.type === 'number'
    ) {
      e.preventDefault();
      e.stopPropagation();
      target.blur();
    }
    const active = document.activeElement;
    if (
      active &&
      active instanceof HTMLInputElement &&
      active.type === 'number'
    ) {
      active.blur();
    }
  },
  { passive: false, capture: true }
);

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

