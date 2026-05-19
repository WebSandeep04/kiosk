import { configureStore } from '@reduxjs/toolkit';
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';
import settingsReducer from './settingsSlice';
import employeesReducer from './employeesSlice';
import logsReducer from './logsSlice';
import authReducer from './authSlice';

export const store = configureStore({
  reducer: {
    settings: settingsReducer,
    employees: employeesReducer,
    logs: logsReducer,
    auth: authReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false, // Turn off serialization warning checks for direct storage and raw data payloads
    }),
});

// Custom hooks to enforce TypeScript types automatically
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
