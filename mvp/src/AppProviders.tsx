import { Provider } from 'react-redux';
import { RouterProvider } from 'react-router-dom';

import { AppThemeProvider } from '@/config/AppThemeProvider.tsx';
import { appRouter } from '@/config/router.tsx';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary.tsx';
import { appStore } from '@/store/appStore.ts';

export const AppProviders = () => {
  return (
    <ErrorBoundary>
      <Provider store={appStore}>
        <AppThemeProvider>
          <RouterProvider router={appRouter} />
        </AppThemeProvider>
      </Provider>
    </ErrorBoundary>
  );
};
