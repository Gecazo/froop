import { Navigate, createBrowserRouter } from 'react-router-dom';

import { APP_ROUTES } from '@/config/routes.ts';
import { RootLayout } from '@/layout/RootLayout.tsx';
import { AnalysisPage } from '@/pages/AnalysisPage.tsx';
import { LandingPage } from '@/pages/LandingPage.tsx';
import { NotFoundPage } from '@/pages/NotFoundPage.tsx';
import { SettingsPage } from '@/pages/SettingsPage.tsx';

export const appRouter = createBrowserRouter([
  {
    path: APP_ROUTES.landing,
    element: <RootLayout />,
    children: [
      {
        index: true,
        element: <LandingPage />
      },
      {
        path: APP_ROUTES.analysis.slice(1),
        element: <AnalysisPage />
      },
      {
        path: APP_ROUTES.settings.slice(1),
        element: <SettingsPage />
      },
      {
        path: APP_ROUTES.notFound.slice(1),
        element: <NotFoundPage />
      },
      {
        path: '*',
        element: <Navigate replace to={APP_ROUTES.notFound} />
      }
    ]
  }
]);
