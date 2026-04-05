import type { PaletteMode } from '@mui/material';

import type { RootState } from '@/store/appStore.ts';

export const selectThemeMode = (state: RootState): PaletteMode => state.ui.themeMode;

export const selectIsDrawerCollapsed = (state: RootState): boolean => state.ui.isDrawerCollapsed;
