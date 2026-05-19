import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CachedEmployee {
  employee_id: number;
  user_id: number;
  name: string;
  embeddings: number[];
}

export interface OfflinePunch {
  id: string;
  user_id: number;
  name: string;
  confidence_match: number;
  latitude: number | null;
  longitude: number | null;
  timestamp: string;
}

export interface KioskSettings {
  serverUrl: string;
  authToken: string;
  distanceThreshold: number;
  cameraSelected: 'front' | 'back';
  isSimulatorMode: boolean;
  latitude: number | null;
  longitude: number | null;
}

const KEYS = {
  SETTINGS: 'kiosk_settings',
  EMPLOYEES: 'kiosk_employees',
  OFFLINE_QUEUE: 'kiosk_offline_queue',
  PUNCH_LOGS: 'kiosk_punch_logs', // For local history display
};

const DEFAULT_SETTINGS: KioskSettings = {
  serverUrl: '', // Initial blank slate
  authToken: '',
  distanceThreshold: 0.6, // Euclidean threshold
  cameraSelected: 'front',
  isSimulatorMode: true, // Default to true so it works out of the box in emulator without native camera crash
  latitude: 26.8467, // Default coordinates (e.g. Lucknow)
  longitude: 80.9462,
};

export const storageService = {
  /**
   * Save Kiosk Settings
   */
  async saveSettings(settings: Partial<KioskSettings>): Promise<KioskSettings> {
    const current = await this.getSettings();
    const updated = { ...current, ...settings };
    await AsyncStorage.setItem(KEYS.SETTINGS, JSON.stringify(updated));
    return updated;
  },

  /**
   * Get Kiosk Settings
   */
  async getSettings(): Promise<KioskSettings> {
    const data = await AsyncStorage.getItem(KEYS.SETTINGS);
    if (!data) return DEFAULT_SETTINGS;
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
    } catch {
      return DEFAULT_SETTINGS;
    }
  },

  /**
   * Cache Synced Employee Embeddings
   */
  async saveEmployees(employees: CachedEmployee[]): Promise<void> {
    await AsyncStorage.setItem(KEYS.EMPLOYEES, JSON.stringify(employees));
  },

  /**
   * Get Cached Employee Embeddings
   */
  async getEmployees(): Promise<CachedEmployee[]> {
    const data = await AsyncStorage.getItem(KEYS.EMPLOYEES);
    if (!data) return [];
    try {
      return JSON.parse(data);
    } catch {
      return [];
    }
  },

  /**
   * Add Punch to Offline Queue
   */
  async addOfflinePunch(punch: Omit<OfflinePunch, 'id' | 'timestamp'>): Promise<OfflinePunch> {
    const newPunch: OfflinePunch = {
      ...punch,
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
    };

    const queue = await this.getOfflineQueue();
    queue.push(newPunch);
    await AsyncStorage.setItem(KEYS.OFFLINE_QUEUE, JSON.stringify(queue));
    
    // Also save to local log history
    await this.addLocalPunchLog({
      name: punch.name,
      action: 'offline_queued',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      success: true,
      offline: true,
    });

    return newPunch;
  },

  /**
   * Get Offline Punch Queue
   */
  async getOfflineQueue(): Promise<OfflinePunch[]> {
    const data = await AsyncStorage.getItem(KEYS.OFFLINE_QUEUE);
    if (!data) return [];
    try {
      return JSON.parse(data);
    } catch {
      return [];
    }
  },

  /**
   * Clear processed punches from offline queue
   */
  async removeOfflinePunches(idsToRemove: string[]): Promise<void> {
    const queue = await this.getOfflineQueue();
    const filtered = queue.filter(item => !idsToRemove.includes(item.id));
    await AsyncStorage.setItem(KEYS.OFFLINE_QUEUE, JSON.stringify(filtered));
  },

  /**
   * Fetch local screen punch history
   */
  async getLocalPunchLogs(): Promise<any[]> {
    const data = await AsyncStorage.getItem(KEYS.PUNCH_LOGS);
    if (!data) return [];
    try {
      return JSON.parse(data);
    } catch {
      return [];
    }
  },

  /**
   * Add a record to local visual punch history feed
   */
  async addLocalPunchLog(logItem: {
    name: string;
    action: string;
    time: string;
    success: boolean;
    offline?: boolean;
    message?: string;
  }): Promise<void> {
    const logs = await this.getLocalPunchLogs();
    const newLog = {
      id: Math.random().toString(36).substring(2, 9),
      ...logItem,
      timestamp: new Date().toISOString(),
    };
    // Keep only last 20 logs for visual history
    const updated = [newLog, ...logs].slice(0, 20);
    await AsyncStorage.setItem(KEYS.PUNCH_LOGS, JSON.stringify(updated));
  },

  /**
   * Clear local visual logs
   */
  async clearLocalPunchLogs(): Promise<void> {
    await AsyncStorage.removeItem(KEYS.PUNCH_LOGS);
  },

  /**
   * Factory Reset: Clear all AsyncStorage data
   */
  async clearAll(): Promise<void> {
    await AsyncStorage.clear();
  }
};
