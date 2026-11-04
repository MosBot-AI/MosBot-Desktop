import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/global.css';
import { App } from './App';
import { ComputerViewer } from './features/computer/ComputerViewer';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Renderer root element is missing');
}

const viewerMode = new URLSearchParams(window.location.search).get('viewer') === '1';
const benchMode = new URLSearchParams(window.location.search).get('bench') === '1';

createRoot(container).render(<StrictMode>{viewerMode ? <ComputerViewer /> : <App />}</StrictMode>);

if (benchMode) {
  // Test-only harness: `pnpm bench:stream` loads the shipped app with ?bench=1 and
  // replays desensitised frames through the real store and React tree.
  void import('./app/bench').then(({ startBench }) => {
    startBench();
  });
}
