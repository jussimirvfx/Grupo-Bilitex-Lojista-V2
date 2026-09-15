import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { configureMetaPixel, MetaPixelProvider } from 'scoretrack';
import { MetaScrollTracking } from './components/MetaScrollTracking';

configureMetaPixel({
  PIXEL_ID: import.meta.env.VITE_META_PIXEL_ID || '2163459471255680',
  // scoretrack 1.0.0 requires a nonempty value; the real token stays in the API.
  ACCESS_TOKEN: 'server-side-only',
  VERBOSE: import.meta.env.DEV,
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MetaPixelProvider>
      <MetaScrollTracking />
      <App />
    </MetaPixelProvider>
  </StrictMode>,
);
