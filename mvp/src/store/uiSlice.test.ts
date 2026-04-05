import type { PaletteMode } from '@mui/material';

import { toggleDrawer, toggleThemeMode, uiReducer } from '@/store/uiSlice.ts';

interface UiReducerState {
  themeMode: PaletteMode;
  isDrawerCollapsed: boolean;
}

describe('uiSlice', () => {
  it('toggles theme mode between dark and light', () => {
    const state: UiReducerState = {
      themeMode: 'dark',
      isDrawerCollapsed: false
    };

    const nextState = uiReducer(state, toggleThemeMode());

    expect(nextState.themeMode).toBe('light');
  });

  it('toggles drawer collapsed state', () => {
    const state: UiReducerState = {
      themeMode: 'dark',
      isDrawerCollapsed: false
    };

    const nextState = uiReducer(state, toggleDrawer());

    expect(nextState.isDrawerCollapsed).toBe(true);
  });
});
