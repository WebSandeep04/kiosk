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
export const loadLocalLogsAndQueue = createAsyncThunk('logs/loadAll', async (_, { getState }) => {
  const state = getState() as any;
  const isOnline = state.logs?.isOnline ?? true;
  
  const offlineQueue = await storageService.getOfflineQueue();
  let logsList: any[] = [];

  if (isOnline) {
    try {
      const response = await apiClient.get('/kiosk/attendance/today-logs');
      if (response.data && response.data.data) {
        logsList = response.data.data;
      } else {
        logsList = await storageService.getLocalPunchLogs();
      }
    } catch (e) {
      console.error('Failed to fetch today logs', e);
      logsList = await storageService.getLocalPunchLogs();
    }
  } else {
    logsList = await storageService.getLocalPunchLogs();
  }

  // Merge offlineQueue punches that haven't been synced yet
  const formattedQueue = offlineQueue.map(q => ({
    id: q.id,
    name: q.name,
    action: 'offline_queued',
    time: new Date(q.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    success: true,
    offline: true,
    timestamp: q.timestamp
  }));

  // Filter out offline_queued from logsList to prevent duplicates
  logsList = logsList.filter(l => l.action !== 'offline_queued');

  // Combine and sort by time/id (offline queue first, then server logs)
  // For simplicity, we just put queued items at the top
  logsList = [...formattedQueue, ...logsList].slice(0, 50);

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

  // Helper: wait for ms milliseconds
  const delay = (ms: number) => new Promise<void>(resolve => setTimeout(() => resolve(), ms));

  for (const punch of queue) {
    let attempts = 0;
    let success = false;

    while (attempts < 3 && !success) {
      attempts++;
      try {
        const response = await apiClient.post('/kiosk/attendance/punch-in', {
          user_id: punch.user_id,
          confidence_match: punch.confidence_match,
          latitude: punch.latitude,
          longitude: punch.longitude,
          device_name: punch.device_name,
        });

        const data = response.data;
        const ok = response.status === 200 || response.status === 201;

        if (ok && data) {
          const payload = data && typeof data === 'object' && 'data' in data ? data.data : data;
          processedCount++;
          processedIds.push(punch.id);
          success = true;
          logs.push(`✓ Synced: ${punch.name} at ${new Date(punch.timestamp).toLocaleTimeString()}`);

          // Update local log to switch from QUEUED to IN/OUT
          await storageService.markOfflineLogAsSynced(punch.name, payload.action || 'in');
        } else {
          // Non-429 server error — don't retry
          failedCount++;
          logs.push(`✗ Failed: ${punch.name} — Server rejected (status ${response.status})`);
          break;
        }
      } catch (err: any) {
        const status = err.response?.status;
        if (status === 429 || status === 403 || status === 422 || status === 400) {
          // Business rejection from server. Mark as processed & remove from queue.
          processedIds.push(punch.id);
          success = true;
          logs.push(`⚠ Skipped: ${punch.name} — ${err.response?.data?.message || 'Rejected by server'}`);
        } else {
          // Other error (e.g., network error or 500) — don't retry in this loop
          failedCount++;
          logs.push(`✗ Error: ${punch.name} — ${err.response?.data?.message || err.message || 'Unknown error'}`);
          break;
        }
      }
    }

    if (!success && attempts >= 3) {
      failedCount++;
      logs.push(`✗ Gave up: ${punch.name} — Too many rate limit retries`);
    }

    // Small delay between punches to avoid connection stacking
    await delay(1000);
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
    device_name: string;
  }, { rejectWithValue }) => {
    try {
      const response = await apiClient.post('/kiosk/attendance/punch-in', params);
      const data = response.data;
      const payload = data && typeof data === 'object' && 'data' in data ? (data as any).data : data;
      return { success: true, data: payload };
    } catch (err: any) {
      const errMsg = err.response?.data?.message || err.message || 'Punch-in request failed.';
      const status = err.response?.status;
      return rejectWithValue({ message: errMsg, status });
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
