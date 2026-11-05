import { ColorManagement } from 'three';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles/app.css';

// Colours are authored and displayed as sRGB values directly (drawing tool, not a renderer).
ColorManagement.enabled = false;

createRoot(document.getElementById('root')!).render(<App />);
