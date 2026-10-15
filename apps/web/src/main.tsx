import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyAppearance, loadAppearance } from './lib/appearance';
import './index.css';
import './styles.css';

// Tema do tabuleiro e peças antes do primeiro render, para não piscar o padrão.
applyAppearance(loadAppearance());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
