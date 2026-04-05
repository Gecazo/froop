import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { PaletteMode } from '@mui/material';

import { THEME_MODE_STORAGE_KEY } from '@/config/localStorageKeys.ts';
import { readStorageValue } from '@/shared/utils/storage.ts';

interface UiState {
  themeMode: PaletteMode;
  isDrawerCollapsed: boolean;
}

const getInitialThemeMode = (): PaletteMode => {
  const persistedMode = readStorageValue<PaletteMode>(THEME_MODE_STORAGE_KEY, 'dark');

  return persistedMode === 'light' ? 'light' : 'dark';
};

const initialState: UiState = {
  themeMode: getInitialThemeMode(),
  isDrawerCollapsed: false
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleThemeMode: (state) => {
      state.themeMode = state.themeMode === 'dark' ? 'light' : 'dark';
    },
    setThemeMode: (state, action: PayloadAction<PaletteMode>) => {
      state.themeMode = action.payload;
    },
    toggleDrawer: (state) => {
      state.isDrawerCollapsed = !state.isDrawerCollapsed;
    }
  }
});

export const { toggleThemeMode, setThemeMode, toggleDrawer } = uiSlice.actions;

export const uiReducer = uiSlice.reducer;
