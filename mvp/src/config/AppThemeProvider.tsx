import { CssBaseline, ThemeProvider } from '@mui/material';
import { useMemo } from 'react';

import { createAppTheme } from '@/config/theme.ts';
import { usePersistThemeMode } from '@/shared/hooks/usePersistThemeMode.ts';
import { useAppSelector } from '@/store/hooks.ts';
import { selectThemeMode } from '@/store/selectors.ts';

interface AppThemeProviderProps {
  children: React.ReactNode;
}

export const AppThemeProvider = ({ children }: AppThemeProviderProps) => {
  const themeMode = useAppSelector(selectThemeMode);

  usePersistThemeMode(themeMode);

  const theme = useMemo(() => createAppTheme(themeMode), [themeMode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
};
