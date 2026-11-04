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

createRoot(container).render(<StrictMode>{viewerMode ? <ComputerViewer /> : <App />}</StrictMode>);
