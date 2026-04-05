import { configureStore } from '@reduxjs/toolkit';

import { dashboardApi } from '@/shared/services/dashboardApi.ts';
import { uiReducer } from '@/store/uiSlice.ts';

export const appStore = configureStore({
  reducer: {
    ui: uiReducer,
    [dashboardApi.reducerPath]: dashboardApi.reducer
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false
    }).concat(dashboardApi.middleware)
});

export type RootState = ReturnType<typeof appStore.getState>;
export type AppDispatch = typeof appStore.dispatch;
