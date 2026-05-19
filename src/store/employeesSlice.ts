import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { storageService, CachedEmployee } from '../services/storage';

export interface EmployeesState {
  list: CachedEmployee[];
  loading: boolean;
  syncing: boolean;
  error: string | null;
}

const initialState: EmployeesState = {
  list: [],
  loading: false,
  syncing: false,
  error: null,
};

import { apiClient } from '../services/api';

// Async thunks
export const loadCachedEmployees = createAsyncThunk('employees/loadCached', async () => {
  const list = await storageService.getEmployees();
  return list;
});

export const syncEmployeesFromServer = createAsyncThunk('employees/syncFromServer', async () => {
  console.log('[KioskSync] Initiating background biometric database synchronization...');
  console.log('[KioskSync] GET request target: "/kiosk/employees/embeddings"');

  try {
    const response = await apiClient.get('/kiosk/employees/embeddings');
    console.log(`[KioskSync] Synchronization response status code: ${response.status}`);
    const data = response.data;
    
    // Unwrap standard Laravel { data: [...] } envelope structure
    const payload = data && typeof data === 'object' && 'data' in data ? data.data : data;
    const rawData = Array.isArray(payload) ? payload : [];
    
    console.log(`[KioskSync] Retrieved ${rawData.length} active employee signatures from backend.`);
    
    const formatted = rawData.map((emp: any) => ({
      employee_id: emp.employee_id,
      user_id: emp.user_id,
      name: emp.name,
      embeddings: Array.isArray(emp.embeddings) ? emp.embeddings : [],
    }));
    
    console.log('[KioskSync] Committing synchronized embeddings to local SQLite storage database...');
    await storageService.saveEmployees(formatted);
    console.log('[KioskSync] Biometric sync and storage commit completed successfully!');
    
    return formatted;
  } catch (err: any) {
    console.error('[KioskSync] Biometric sync execution caught an error block:');
    console.error(`[KioskSync] Error context: ${err.message || err}`);
    throw err;
  }
});

export const enrollFaceAction = createAsyncThunk(
  'employees/enrollFace',
  async (params: { employeeId: number; embeddings: number[] }, { rejectWithValue }) => {
    try {
      const response = await apiClient.post(`/kiosk/employee/${params.employeeId}/enroll-face`, {
        embeddings: params.embeddings,
      });
      const data = response.data;
      const payload = data && typeof data === 'object' && 'data' in data ? (data as any).data : data;
      return { success: true, data: payload };
    } catch (err: any) {
      const errMsg = err.response?.data?.message || err.message || 'Face enrollment failed.';
      return rejectWithValue(errMsg);
    }
  }
);

const employeesSlice = createSlice({
  name: 'employees',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      // Load Cached Employees
      .addCase(loadCachedEmployees.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loadCachedEmployees.fulfilled, (state, action: PayloadAction<CachedEmployee[]>) => {
        state.loading = false;
        state.list = action.payload;
      })
      .addCase(loadCachedEmployees.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to load cached employees';
      })
      // Sync from server
      .addCase(syncEmployeesFromServer.pending, (state) => {
        state.syncing = true;
        state.error = null;
      })
      .addCase(syncEmployeesFromServer.fulfilled, (state, action: PayloadAction<CachedEmployee[]>) => {
        state.syncing = false;
        state.list = action.payload;
      })
      .addCase(syncEmployeesFromServer.rejected, (state, action) => {
        state.syncing = false;
        state.error = action.error.message || 'Failed to sync employees';
      });
  },
});

export default employeesSlice.reducer;
