import SQLite, { SQLiteDatabase } from 'react-native-sqlite-storage';

SQLite.enablePromise(true);

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
  tenantId: string | number;
  distanceThreshold: number;
  cameraSelected: 'front' | 'back';
  isSimulatorMode: boolean;
  latitude: number | null;
  longitude: number | null;
  adminPin?: string;
}

const DEFAULT_SETTINGS: KioskSettings = {
  serverUrl: '', 
  authToken: '',
  tenantId: '',
  distanceThreshold: 0.6, 
  cameraSelected: 'front',
  isSimulatorMode: true, 
  latitude: 26.8467, 
  longitude: 80.9462,
  adminPin: '',
};

let db: SQLiteDatabase | null = null;

export const storageService = {
  async initDB(): Promise<void> {
    if (db) return;
    try {
      db = await SQLite.openDatabase({ name: 'kiosk.db', location: 'default' });

      await db.transaction(tx => {
        // Settings table (key, value)
        tx.executeSql(
          'CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE, value TEXT);'
        );
        // Employees table
        tx.executeSql(
          'CREATE TABLE IF NOT EXISTS employees (employee_id INTEGER PRIMARY KEY, user_id INTEGER, name TEXT, embeddings TEXT);'
        );
        // Offline Queue table
        tx.executeSql(
          'CREATE TABLE IF NOT EXISTS offline_queue (id TEXT PRIMARY KEY, user_id INTEGER, name TEXT, confidence_match REAL, latitude REAL, longitude REAL, timestamp TEXT);'
        );
        // Punch Logs table
        tx.executeSql(
          'CREATE TABLE IF NOT EXISTS punch_logs (id TEXT PRIMARY KEY, name TEXT, action TEXT, time TEXT, success INTEGER, offline INTEGER, message TEXT, timestamp TEXT);'
        );
      });
    } catch (error) {
      console.error('Failed to initialize SQLite DB:', error);
      throw error;
    }
  },

  async _getDB(): Promise<SQLiteDatabase> {
    if (!db) await this.initDB();
    return db!;
  },

  /**
   * Save Kiosk Settings
   */
  async saveSettings(settings: Partial<KioskSettings>): Promise<KioskSettings> {
    const current = await this.getSettings();
    const updated = { ...current, ...settings };
    const database = await this._getDB();
    
    await database.transaction(tx => {
      tx.executeSql(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?);',
        ['KIOSK_SETTINGS', JSON.stringify(updated)]
      );
    });
    
    return updated;
  },

  /**
   * Get Kiosk Settings
   */
  async getSettings(): Promise<KioskSettings> {
    const database = await this._getDB();
    return new Promise((resolve) => {
      database.transaction(tx => {
        tx.executeSql(
          'SELECT value FROM settings WHERE key = ?;',
          ['KIOSK_SETTINGS'],
          (_, results) => {
            if (results.rows.length > 0) {
              try {
                const parsed = JSON.parse(results.rows.item(0).value);
                resolve({ ...DEFAULT_SETTINGS, ...parsed });
              } catch {
                resolve(DEFAULT_SETTINGS);
              }
            } else {
              resolve(DEFAULT_SETTINGS);
            }
          }
        );
      });
    });
  },

  /**
   * Cache Synced Employee Embeddings
   */
  async saveEmployees(employees: CachedEmployee[]): Promise<void> {
    const database = await this._getDB();
    await database.transaction(tx => {
      // Clear existing records
      tx.executeSql('DELETE FROM employees;');
      // Insert new records
      for (const emp of employees) {
        tx.executeSql(
          'INSERT INTO employees (employee_id, user_id, name, embeddings) VALUES (?, ?, ?, ?);',
          [emp.employee_id, emp.user_id, emp.name, JSON.stringify(emp.embeddings)]
        );
      }
    });
  },

  /**
   * Get Cached Employee Embeddings
   */
  async getEmployees(): Promise<CachedEmployee[]> {
    const database = await this._getDB();
    return new Promise((resolve) => {
      database.transaction(tx => {
        tx.executeSql(
          'SELECT * FROM employees;',
          [],
          (_, results) => {
            const employees: CachedEmployee[] = [];
            for (let i = 0; i < results.rows.length; i++) {
              const row = results.rows.item(i);
              try {
                employees.push({
                  employee_id: row.employee_id,
                  user_id: row.user_id,
                  name: row.name,
                  embeddings: JSON.parse(row.embeddings),
                });
              } catch (e) {
                // Ignore parsing errors for individual rows
              }
            }
            resolve(employees);
          }
        );
      });
    });
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

    const database = await this._getDB();
    await database.transaction(tx => {
      tx.executeSql(
        'INSERT INTO offline_queue (id, user_id, name, confidence_match, latitude, longitude, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?);',
        [
          newPunch.id, 
          newPunch.user_id, 
          newPunch.name, 
          newPunch.confidence_match, 
          newPunch.latitude === null ? 0 : newPunch.latitude, 
          newPunch.longitude === null ? 0 : newPunch.longitude, 
          newPunch.timestamp
        ],
        () => {},
        (_, err) => { console.error('Failed to insert offline punch', err); return false; }
      );
    });
    
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
    const database = await this._getDB();
    return new Promise((resolve) => {
      database.transaction(tx => {
        tx.executeSql(
          'SELECT * FROM offline_queue ORDER BY timestamp ASC;',
          [],
          (_, results) => {
            const queue: OfflinePunch[] = [];
            for (let i = 0; i < results.rows.length; i++) {
              queue.push(results.rows.item(i));
            }
            resolve(queue);
          }
        );
      });
    });
  },

  /**
   * Clear processed punches from offline queue
   */
  async removeOfflinePunches(idsToRemove: string[]): Promise<void> {
    if (idsToRemove.length === 0) return;
    const database = await this._getDB();
    
    // Create placeholders: ?, ?, ?
    const placeholders = idsToRemove.map(() => '?').join(',');
    
    await database.transaction(tx => {
      tx.executeSql(
        `DELETE FROM offline_queue WHERE id IN (${placeholders});`,
        idsToRemove
      );
    });
  },

  /**
   * Fetch local screen punch history
   */
  async getLocalPunchLogs(): Promise<any[]> {
    const database = await this._getDB();
    return new Promise((resolve) => {
      database.transaction(tx => {
        // Limit to 20 logs as original logic
        tx.executeSql(
          'SELECT * FROM punch_logs ORDER BY timestamp DESC LIMIT 20;',
          [],
          (_, results) => {
            const logs: any[] = [];
            for (let i = 0; i < results.rows.length; i++) {
              const row = results.rows.item(i);
              logs.push({
                ...row,
                success: row.success === 1,
                offline: row.offline === 1
              });
            }
            resolve(logs);
          }
        );
      });
    });
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
    const database = await this._getDB();
    const id = Math.random().toString(36).substring(2, 9);
    const timestamp = new Date().toISOString();
    
    await database.transaction(tx => {
      tx.executeSql(
        'INSERT INTO punch_logs (id, name, action, time, success, offline, message, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?);',
        [
          id, 
          logItem.name, 
          logItem.action, 
          logItem.time, 
          logItem.success ? 1 : 0, 
          logItem.offline ? 1 : 0, 
          logItem.message || null, 
          timestamp
        ]
      );
      
      // Clean up old logs to keep only last 20
      tx.executeSql(
        `DELETE FROM punch_logs WHERE id NOT IN (
          SELECT id FROM punch_logs ORDER BY timestamp DESC LIMIT 20
        );`
      );
    });
  },

  /**
   * Update an offline queued log to show as synced (e.g., 'in' or 'out')
   */
  async markOfflineLogAsSynced(name: string, newAction: string): Promise<void> {
    const database = await this._getDB();
    await database.transaction(tx => {
      tx.executeSql(
        `UPDATE punch_logs SET action = ?, message = 'Edge Verified (Synced)' WHERE name = ? AND action = 'offline_queued';`,
        [newAction, name]
      );
    });
  },

  /**
   * Clear local visual logs
   */
  async clearLocalPunchLogs(): Promise<void> {
    const database = await this._getDB();
    await database.transaction(tx => {
      tx.executeSql('DELETE FROM punch_logs;');
    });
  },

  /**
   * Factory Reset: Clear all SQLite data tables
   */
  async clearAll(): Promise<void> {
    const database = await this._getDB();
    await database.transaction(tx => {
      tx.executeSql('DELETE FROM settings;');
      tx.executeSql('DELETE FROM employees;');
      tx.executeSql('DELETE FROM offline_queue;');
      tx.executeSql('DELETE FROM punch_logs;');
    });
  }
};
