import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Switch,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { THEME } from '../constants/theme';
import { storageService, KioskSettings, OfflinePunch } from '../services/storage';
import { apiService } from '../services/api';
import { SettingsIcon, SyncIcon, WifiIcon, CrossIcon } from '../components/Icons';
import { useAppDispatch } from '../store';
import { syncEmployeesFromServer } from '../store/employeesSlice';
import { syncOfflineQueueAction } from '../store/logsSlice';
import DatabaseViewerScreen from './DatabaseViewerScreen';
import SystemLogsScreen from './SystemLogsScreen';

interface SettingsScreenProps {
  onLogout: () => void;
}

export default function SettingsScreen({ onLogout }: SettingsScreenProps) {
  const dispatch = useAppDispatch();
  const [settings, setSettings] = useState<KioskSettings | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncingQueue, setSyncingQueue] = useState(false);
  const [offlineQueue, setOfflineQueue] = useState<OfflinePunch[]>([]);
  const [dbViewerVisible, setDbViewerVisible] = useState(false);
  const [logsViewerVisible, setLogsViewerVisible] = useState(false);
  const [employeeCount, setEmployeeCount] = useState(0);
  const [tempLat, setTempLat] = useState('');
  const [tempLng, setTempLng] = useState('');
  const [tempDeviceName, setTempDeviceName] = useState('');

  const loadData = async () => {
    const activeSettings = await storageService.getSettings();
    setSettings(activeSettings);
    setTempLat(activeSettings.latitude?.toString() || '');
    setTempLng(activeSettings.longitude?.toString() || '');
    setTempDeviceName(activeSettings.deviceName || '');

    const employees = await storageService.getEmployees();
    setEmployeeCount(employees.length);

    const queue = await storageService.getOfflineQueue();
    setOfflineQueue(queue);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleUpdateSetting = async (key: keyof KioskSettings, value: any) => {
    if (!settings) return;
    const updated = await storageService.saveSettings({ [key]: value });
    setSettings(updated);
  };

  const handleSaveCoordinates = async () => {
    const lat = parseFloat(tempLat);
    const lng = parseFloat(tempLng);
    if (isNaN(lat) || isNaN(lng)) {
      Alert.alert('Error', 'Please enter valid numbers for latitude and longitude.');
      return;
    }
    await handleUpdateSetting('latitude', lat);
    await handleUpdateSetting('longitude', lng);
    Alert.alert('Success', 'GPS coordinates updated successfully.');
  };

  const handleSaveDeviceName = async () => {
    await handleUpdateSetting('deviceName', tempDeviceName);
    Alert.alert('Success', 'Device Name updated successfully.');
  };

  const handleSyncEmployees = async () => {
    setSyncing(true);
    try {
      const result = await dispatch(syncEmployeesFromServer()).unwrap();
      if (result) {
        setEmployeeCount(result.length);
        Alert.alert('Sync Successful', `Downloaded ${result.length} active employee embeddings from Laravel backend.`);
      } else {
        Alert.alert('Sync Failed', 'Check connection settings.');
      }
    } catch (err: any) {
      Alert.alert('Sync Error', err.message || 'An error occurred.');
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncOfflineQueue = async () => {
    if (offlineQueue.length === 0) {
      Alert.alert('Queue Empty', 'There are no pending offline punch-ins to upload.');
      return;
    }
    setSyncingQueue(true);
    try {
      const result = await dispatch(syncOfflineQueueAction()).unwrap();
      const msg = `Offline Queue Sync Complete:\nProcessed: ${result.processedCount}\nFailed: ${result.failedCount}\n\nLogs:\n${result.logs.join('\n')}`;
      Alert.alert('Offline Queue Sync', msg);
      await loadData();
    } catch (err: any) {
      Alert.alert('Sync Error', err.message || 'Failed to sync offline queue.');
    } finally {
      setSyncingQueue(false);
    }
  };

  const handleClearLocalLogs = async () => {
    Alert.alert('Clear History', 'Are you sure you want to delete all local scan logs from the dashboard history?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear All',
        style: 'destructive',
        onPress: async () => {
          await storageService.clearLocalPunchLogs();
          Alert.alert('Success', 'Dashboard local scan history cleared.');
        },
      },
    ]);
  };

  const handleResetKiosk = () => {
    Alert.alert(
      'Disconnect Gateway',
      'This will clear local cache and credentials. You will need to log in to your Laravel backend again. Proceed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            await storageService.clearAll();
            onLogout();
          },
        },
      ]
    );
  };

  if (!settings) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={THEME.colors.accent} size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContainer}>

      {/* 📱 Device Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Device Information</Text>

        <View style={styles.coordsRow}>
          <View style={styles.coordCol}>
            <Text style={styles.coordLabel}>Device Name</Text>
            <TextInput
              style={styles.coordInput}
              value={tempDeviceName}
              onChangeText={setTempDeviceName}
              placeholder="e.g. Lobby Entrance Kiosk"
              placeholderTextColor={THEME.colors.textMuted}
            />
          </View>
          <TouchableOpacity style={styles.saveCoordsBtn} onPress={handleSaveDeviceName}>
            <Text style={styles.saveCoordsBtnText}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 🔄 Data Synchronization */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Data Synchronizations</Text>

        <View style={styles.syncRow}>
          <View style={styles.syncMeta}>
            <Text style={styles.syncLabel}>Active Face Embeddings ({employeeCount})</Text>
            <Text style={styles.syncDesc}>Download facial landmark profiles of enrolled employees from Laravel to run on-device matching.</Text>
          </View>
          <TouchableOpacity
            style={[styles.syncBtn, syncing && styles.btnDisabled]}
            onPress={handleSyncEmployees}
            disabled={syncing}
          >
            {syncing ? (
              <ActivityIndicator color={THEME.colors.text} size="small" />
            ) : (
              <>
                <SyncIcon color={THEME.colors.text} size={14} />
                <Text style={styles.syncBtnText}>Sync Now</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        <View style={styles.syncRow}>
          <View style={styles.syncMeta}>
            <Text style={styles.syncLabel}>Offline Punch Queue ({offlineQueue.length})</Text>
            <Text style={styles.syncDesc}>Upload attendance punches logged while the Kiosk was offline to the Laravel database.</Text>
          </View>
          <TouchableOpacity
            style={[
              styles.syncBtn,
              offlineQueue.length === 0 && styles.btnDisabled,
              syncingQueue && styles.btnDisabled,
            ]}
            onPress={handleSyncOfflineQueue}
            disabled={syncingQueue || offlineQueue.length === 0}
          >
            {syncingQueue ? (
              <ActivityIndicator color={THEME.colors.text} size="small" />
            ) : (
              <>
                <WifiIcon color={THEME.colors.text} size={14} active={offlineQueue.length > 0} />
                <Text style={styles.syncBtnText}>Upload Queue</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* 🛠️ Maintenance & Reset */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Maintenance & Security</Text>

        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => setDbViewerVisible(true)}>
            <Text style={styles.actionBtnText}>🗄️ View Raw Database</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => setLogsViewerVisible(true)}>
            <Text style={styles.actionBtnText}>📋 View System Logs</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.dangerBtn]} onPress={handleResetKiosk}>
            <Text style={[styles.actionBtnText, styles.dangerText]}>Clear all Data</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.versionText}>Edge Kiosk Engine v1.0.0 • Connected to Magnify</Text>

      {/* Dev Tools Modals */}
      <DatabaseViewerScreen visible={dbViewerVisible} onClose={() => setDbViewerVisible(false)} />
      <SystemLogsScreen visible={logsViewerVisible} onClose={() => setLogsViewerVisible(false)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  scrollContainer: {
    padding: THEME.spacing.md,
    paddingBottom: THEME.spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: THEME.spacing.lg,
    gap: THEME.spacing.sm,
  },
  title: {
    color: THEME.colors.text,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: THEME.colors.background,
  },
  section: {
    backgroundColor: THEME.colors.surfaceGlass,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: THEME.radius.lg,
    padding: THEME.spacing.md,
    marginBottom: THEME.spacing.md,
  },
  sectionTitle: {
    color: THEME.colors.accent,
    fontSize: 15,
    fontWeight: 'bold',
    letterSpacing: 0.5,
    marginBottom: THEME.spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: THEME.spacing.md,
  },
  rowMeta: {
    flex: 1,
  },
  rowLabel: {
    color: THEME.colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  rowDesc: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  thresholdInput: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    color: THEME.colors.accent,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: THEME.radius.sm,
    paddingHorizontal: THEME.spacing.sm,
    paddingVertical: THEME.spacing.xs,
    width: 60,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: 'bold',
  },
  sliderButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: THEME.spacing.md,
  },
  sliderValueBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: THEME.radius.sm,
    paddingVertical: THEME.spacing.xs,
    alignItems: 'center',
    marginHorizontal: 3,
  },
  sliderValueBtnActive: {
    backgroundColor: THEME.colors.accent,
    borderColor: THEME.colors.accent,
  },
  sliderValueBtnText: {
    color: THEME.colors.textMuted,
    fontSize: 11,
  },
  divider: {
    height: 1,
    backgroundColor: THEME.colors.border,
    marginVertical: THEME.spacing.md,
    opacity: 0.5,
  },
  coordsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: THEME.spacing.md,
    gap: THEME.spacing.sm,
  },
  coordCol: {
    flex: 2,
  },
  coordLabel: {
    color: THEME.colors.textSecondary,
    fontSize: 11,
    marginBottom: 4,
  },
  coordInput: {
    backgroundColor: 'rgba(0,0,0,0.02)',
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: THEME.radius.sm,
    color: THEME.colors.text,
    paddingHorizontal: THEME.spacing.sm,
    paddingVertical: THEME.spacing.xs,
    fontSize: 13,
  },
  saveCoordsBtn: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: THEME.radius.sm,
    paddingVertical: THEME.spacing.xs + 2,
    paddingHorizontal: THEME.spacing.md,
    height: 34,
    justifyContent: 'center',
  },
  saveCoordsBtnText: {
    color: THEME.colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: THEME.spacing.md,
  },
  syncMeta: {
    flex: 1,
  },
  syncLabel: {
    color: THEME.colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  syncDesc: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    lineHeight: 14,
    marginTop: 2,
  },
  syncBtn: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: THEME.radius.md,
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: THEME.spacing.sm,
  },
  syncBtnText: {
    color: THEME.colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.4,
  },
  actionsContainer: {
    gap: THEME.spacing.sm,
    marginTop: THEME.spacing.xs,
  },
  actionBtn: {
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: THEME.radius.md,
    paddingVertical: THEME.spacing.sm,
    alignItems: 'center',
  },
  actionBtnText: {
    color: THEME.colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  dangerBtn: {
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  dangerText: {
    color: THEME.colors.danger,
  },
  versionText: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
    marginTop: THEME.spacing.md,
  },
});
