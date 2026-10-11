import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(<App />);

// PWA: registra o service worker apenas em producao. Em dev o SW atrapalharia
// o HMR (cachearia assets entre recarregamentos); em prod ele e o que permite
// instalar o app no celular e abrir offline.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* sem SW o app continua funcionando normalmente */
    });
  });
}
