import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { storageService, OfflinePunch } from '../services/storage';
import { apiClient } from '../services/api';

export interface LogsState {
  logsList: any[];
  offlineQueue: OfflinePunch[];
  isOnline: boolean;
  syncingQueue: boolean;
  loadingLogs: boolean;
}

const initialState: LogsState = {
  logsList: [],
  offlineQueue: [],
  isOnline: true,
  syncingQueue: false,
  loadingLogs: false,
};

// Async thunks
export const loadLocalLogsAndQueue = createAsyncThunk('logs/loadAll', async () => {
  const logsList = await storageService.getLocalPunchLogs();
  const offlineQueue = await storageService.getOfflineQueue();
  return { logsList, offlineQueue };
});

export const addOfflinePunchAction = createAsyncThunk(
  'logs/addOffline',
  async (punch: Omit<OfflinePunch, 'id' | 'timestamp'>) => {
    const newPunch = await storageService.addOfflinePunch(punch);
    return newPunch;
  }
);

export const syncOfflineQueueAction = createAsyncThunk('logs/syncQueue', async () => {
  const queue = await storageService.getOfflineQueue();
  if (queue.length === 0) {
    return { processedCount: 0, failedCount: 0, logs: ['Offline queue is empty.'] };
  }

  const logs: string[] = [];
  let processedCount = 0;
  let failedCount = 0;
  const processedIds: string[] = [];

  for (const punch of queue) {
    try {
      const response = await apiClient.post('/kiosk/attendance/punch-in', {
        user_id: punch.user_id,
        confidence_match: punch.confidence_match,
        latitude: punch.latitude,
        longitude: punch.longitude,
      });

      const data = response.data;
      const success = response.status === 200 || response.status === 201;

      if (success && data) {
        const payload = data && typeof data === 'object' && 'data' in data ? data.data : data;

        processedCount++;
        processedIds.push(punch.id);
        logs.push(`Successfully synced offline punch for ${punch.name} at ${punch.timestamp}`);

        // Log locally
        await storageService.addLocalPunchLog({
          name: punch.name,
          action: payload.action || 'synced_offline',
          time: new Date(punch.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          success: true,
          message: `Synced Offline (ID: ${punch.user_id})`,
        });
      } else {
        failedCount++;
        logs.push(`Failed to sync offline punch for ${punch.name}: Connection issue.`);
      }
    } catch (err: any) {
      failedCount++;
      logs.push(`Error syncing offline punch for ${punch.name}: ${err.message || err}`);
    }
  }

  if (processedIds.length > 0) {
    await storageService.removeOfflinePunches(processedIds);
  }

  return { processedCount, failedCount, logs };
});

export const punchInAction = createAsyncThunk(
  'logs/punchIn',
  async (params: {
    user_id: number;
    confidence_match: number;
    latitude: number | null;
    longitude: number | null;
  }, { rejectWithValue }) => {
    try {
      const response = await apiClient.post('/kiosk/attendance/punch-in', params);
      const data = response.data;
      const payload = data && typeof data === 'object' && 'data' in data ? (data as any).data : data;
      return { success: true, data: payload };
    } catch (err: any) {
      const errMsg = err.response?.data?.message || err.message || 'Punch-in request failed.';
      return rejectWithValue(errMsg);
    }
  }
);

const logsSlice = createSlice({
  name: 'logs',
  initialState,
  reducers: {
    setOnlineStatus(state, action: PayloadAction<boolean>) {
      state.isOnline = action.payload;
    },
    addLocalLogOptimistic(state, action: PayloadAction<any>) {
      state.logsList = [action.payload, ...state.logsList].slice(0, 50); // limit to 50
    },
  },
  extraReducers: (builder) => {
    builder
      // Load All Logs and Queue
      .addCase(loadLocalLogsAndQueue.pending, (state) => {
        state.loadingLogs = true;
      })
      .addCase(loadLocalLogsAndQueue.fulfilled, (state, action) => {
        state.loadingLogs = false;
        state.logsList = action.payload.logsList;
        state.offlineQueue = action.payload.offlineQueue;
      })
      .addCase(loadLocalLogsAndQueue.rejected, (state) => {
        state.loadingLogs = false;
      })
      // Add Offline Punch
      .addCase(addOfflinePunchAction.fulfilled, (state, action: PayloadAction<OfflinePunch>) => {
        state.offlineQueue.push(action.payload);
      })
      // Sync Queue
      .addCase(syncOfflineQueueAction.pending, (state) => {
        state.syncingQueue = true;
      })
      .addCase(syncOfflineQueueAction.fulfilled, (state) => {
        state.syncingQueue = false;
      })
      .addCase(syncOfflineQueueAction.rejected, (state) => {
        state.syncingQueue = false;
      });
  },
});

export const { setOnlineStatus, addLocalLogOptimistic } = logsSlice.actions;
export default logsSlice.reducer;
