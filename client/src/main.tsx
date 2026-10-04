import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import '@fontsource-variable/josefin-sans';
import '@fontsource-variable/mulish';
import 'flag-icons/css/flag-icons.min.css';
import './styles/theme.css';
import App from './App';
import { DEV } from './lib/devMode';

if (DEV) document.title = '🛠️ Project Leather (Developer)';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
