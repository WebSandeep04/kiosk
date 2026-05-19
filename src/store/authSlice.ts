import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import axios from 'axios';
import { storageService } from '../services/storage';
import { GATEWAY_URL } from '../services/api';

export interface AuthState {
  user: any | null;
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
}

const initialState: AuthState = {
  user: null,
  token: null,
  isAuthenticated: false,
  loading: false,
  error: null,
};

interface KioskLoginPayload {
  tenantCode: string;
  email: string;
  password: string;
}

// Async thunk to perform Kiosk credentials-based login
export const kioskLoginAction = createAsyncThunk(
  'auth/kioskLogin',
  async (credentials: KioskLoginPayload, { rejectWithValue }) => {
    const { tenantCode, email, password } = credentials;
    console.log('[KioskAuth] Starting terminal connection onboarding sequence...');
    console.log(`[KioskAuth] Gateway URL: "${GATEWAY_URL}"`);
    console.log(`[KioskAuth] Tenant registry lookup target: "${tenantCode}"`);
    console.log(`[KioskAuth] Administrator email context: "${email}"`);

    try {
      if (!tenantCode || !email || !password) {
        console.warn('[KioskAuth] Onboarding validation failed: missing credentials.');
        return rejectWithValue('Tenant Code, Email, and Password are required.');
      }

      console.log('[KioskAuth] Dispatching dynamic connection request to Workorio API...');
      const response = await axios.post(`${GATEWAY_URL}/kiosk/login`, {
        tenant_code: tenantCode,
        email,
        password,
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        timeout: 15000,
      });

      console.log(`[KioskAuth] API responded with status code: ${response.status}`);

      if (response.data?.success && response.data?.data?.token) {
        const token = response.data.data.token;
        const user = response.data.data;

        console.log('[KioskAuth] Credentials validated successfully! Token issued by tenant database.');
        console.log(`[KioskAuth] Masked Token prefix: "${token.substring(0, 10)}..."`);

        // 1. Commit server URL and token successfully to local storage settings
        console.log('[KioskAuth] Caching dynamic credentials inside local SQLite device storage settings...');
        await storageService.saveSettings({
          serverUrl: GATEWAY_URL,
          authToken: token,
        });
        console.log('[KioskAuth] Local storage settings configured successfully!');

        return { token, user };
      }

      console.warn('[KioskAuth] Authentication handshake was explicitly rejected by backend logic.');
      return rejectWithValue(response.data?.message || 'Authentication failed.');
    } catch (err: any) {
      console.error('[KioskAuth] Authentication execution caught an error block:');
      if (err.response) {
        console.error(`[KioskAuth] Server Error response status: ${err.response.status}`);
        console.error(`[KioskAuth] Server Error response body: ${JSON.stringify(err.response.data)}`);
      } else {
        console.error(`[KioskAuth] Low-level connection error context: ${err.message || err}`);
      }

      if (err.response?.status === 401 || err.response?.status === 422 || err.response?.status === 404) {
        return rejectWithValue(err.response.data?.message || 'Invalid credentials or tenant code.');
      }
      const errMsg = err.response?.data?.message || err.message || 'Failed to reach server.';
      return rejectWithValue(`Connection Error: ${errMsg}`);
    }
  }
);

// Load persisted session token on startup
export const loadSessionAction = createAsyncThunk('auth/loadSession', async () => {
  const settings = await storageService.getSettings();
  if (settings.authToken && settings.authToken !== 'mock-token-bypassed') {
    return settings.authToken;
  }
  return null;
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logoutAction(state) {
      state.user = null;
      state.token = null;
      state.isAuthenticated = false;
      state.error = null;
      // Trigger factory reset
      storageService.clearAll();
    },
    clearAuthError(state) {
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    builder
      // Kiosk Login
      .addCase(kioskLoginAction.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(kioskLoginAction.fulfilled, (state, action: PayloadAction<{ token: string; user: any }>) => {
        state.loading = false;
        state.token = action.payload.token;
        state.user = action.payload.user;
        state.isAuthenticated = true;
      })
      .addCase(kioskLoginAction.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string || action.error.message || 'Authentication failed';
        state.isAuthenticated = false;
      })
      // Load existing session
      .addCase(loadSessionAction.fulfilled, (state, action: PayloadAction<string | null>) => {
        if (action.payload) {
          state.token = action.payload;
          state.isAuthenticated = true;
        }
      });
  },
});

export const { logoutAction, clearAuthError } = authSlice.actions;
export default authSlice.reducer;
