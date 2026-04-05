import type { PaletteMode } from '@mui/material';
import { useEffect } from 'react';

import { THEME_MODE_STORAGE_KEY } from '@/config/localStorageKeys.ts';
import { writeStorageValue } from '@/shared/utils/storage.ts';

export const usePersistThemeMode = (themeMode: PaletteMode): void => {
  useEffect(() => {
    writeStorageValue(THEME_MODE_STORAGE_KEY, themeMode);
    document.documentElement.dataset.themeMode = themeMode;
  }, [themeMode]);
};
