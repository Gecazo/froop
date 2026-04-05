import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { AppProviders } from '@/AppProviders.tsx';
import '@/styles/index.scss';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Missing root element with id "root".');
}

createRoot(rootElement).render(
  <StrictMode>
    <AppProviders />
  </StrictMode>
);
