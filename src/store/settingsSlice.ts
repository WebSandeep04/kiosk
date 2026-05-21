import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { storageService } from '../services/storage';

export interface SettingsState {
  serverUrl: string;
  authToken: string;
  distanceThreshold: number;
  cameraDirection: 'front' | 'back';
  isSimulatorMode: boolean;
  latitude: number | null;
  longitude: number | null;
  loading: boolean;
  error: string | null;
  adminPin: string | null;
}

const initialState: SettingsState = {
  serverUrl: '',
  authToken: '',
  distanceThreshold: 0.6,
  cameraDirection: 'front',
  isSimulatorMode: true,
  latitude: null,
  longitude: null,
  loading: false,
  error: null,
  adminPin: null,
};

// Async thunks for storage interactions
export const loadSettings = createAsyncThunk('settings/loadSettings', async () => {
  const settings = await storageService.getSettings();
  return settings;
});

export const updateSettings = createAsyncThunk(
  'settings/updateSettings',
  async (settings: Partial<Omit<SettingsState, 'loading' | 'error'>>) => {
    await storageService.saveSettings(settings);
    return settings;
  }
);

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      // Load settings
      .addCase(loadSettings.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loadSettings.fulfilled, (state, action: PayloadAction<any>) => {
        state.loading = false;
        state.serverUrl = action.payload.serverUrl || '';
        state.authToken = action.payload.authToken || '';
        state.distanceThreshold = action.payload.distanceThreshold ?? 0.6;
        state.cameraDirection = action.payload.cameraDirection || 'front';
        state.isSimulatorMode = action.payload.isSimulatorMode ?? true;
        state.latitude = action.payload.latitude ?? null;
        state.longitude = action.payload.longitude ?? null;
        state.adminPin = action.payload.adminPin || null;
      })
      .addCase(loadSettings.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to load settings';
      })
      // Update settings
      .addCase(updateSettings.fulfilled, (state, action: PayloadAction<any>) => {
        if (action.payload.serverUrl !== undefined) state.serverUrl = action.payload.serverUrl;
        if (action.payload.authToken !== undefined) state.authToken = action.payload.authToken;
        if (action.payload.distanceThreshold !== undefined) {
          state.distanceThreshold = action.payload.distanceThreshold;
        }
        if (action.payload.cameraDirection !== undefined) {
          state.cameraDirection = action.payload.cameraDirection;
        }
        if (action.payload.isSimulatorMode !== undefined) {
          state.isSimulatorMode = action.payload.isSimulatorMode;
        }
        if (action.payload.latitude !== undefined) state.latitude = action.payload.latitude;
        if (action.payload.longitude !== undefined) state.longitude = action.payload.longitude;
        if (action.payload.adminPin !== undefined) state.adminPin = action.payload.adminPin;
      });
  },
});

export default settingsSlice.reducer;
