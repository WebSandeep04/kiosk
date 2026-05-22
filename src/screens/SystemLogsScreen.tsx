import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { THEME } from '../constants/theme';
import { storageService } from '../services/storage';
import { CrossIcon } from '../components/Icons';

interface SystemLogsProps {
  visible: boolean;
  onClose: () => void;
}

export default function SystemLogsScreen({ visible, onClose }: SystemLogsProps) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      loadLogs();
    }
  }, [visible]);

  const loadLogs = async () => {
    try {
      setLoading(true);
      setError(null);
      // Fetch logs, ordered by newest first
      const rows = await storageService.executeRawQuery("SELECT * FROM punch_logs ORDER BY timestamp DESC LIMIT 200");
      setLogs(rows);
    } catch (err: any) {
      setError(err.message || 'Failed to load system logs');
    } finally {
      setLoading(false);
    }
  };

  const clearLogs = async () => {
    try {
      setLoading(true);
      await storageService.executeRawQuery("DELETE FROM punch_logs");
      setLogs([]);
    } catch (err: any) {
      setError(err.message || 'Failed to clear logs');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>System Logs & Errors</Text>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <CrossIcon color={THEME.colors.text} size={24} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 20 }} size="large" color={THEME.colors.accent} />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : (
          <View style={{ flex: 1 }}>
            <View style={styles.actionRow}>
               <TouchableOpacity style={styles.clearBtn} onPress={clearLogs}>
                  <Text style={styles.clearBtnText}>Clear Logs</Text>
               </TouchableOpacity>
            </View>

            <ScrollView style={styles.content}>
              {logs.length === 0 ? (
                <Text style={styles.emptyText}>No logs found in the database.</Text>
              ) : (
                logs.map((log) => (
                  <View key={log.id} style={styles.logCard}>
                    <View style={styles.logHeader}>
                      <Text style={styles.logTime}>{new Date(log.timestamp).toLocaleString()}</Text>
                      <View style={[styles.badge, log.success === 1 ? styles.badgeSuccess : styles.badgeError]}>
                        <Text style={styles.badgeText}>{log.success === 1 ? 'SUCCESS' : 'ERROR'}</Text>
                      </View>
                    </View>
                    <Text style={styles.logName}>User: {log.name}</Text>
                    <Text style={styles.logAction}>Action: {log.action.toUpperCase()}</Text>
                    {!!log.message && (
                      <Text style={[styles.logMessage, log.success === 0 && styles.logMessageError]}>
                        {log.message}
                      </Text>
                    )}
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: THEME.colors.text,
  },
  closeButton: {
    position: 'absolute',
    right: 16,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
  },
  clearBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: THEME.colors.danger,
    borderRadius: THEME.radius.sm,
  },
  clearBtnText: {
    color: THEME.colors.danger,
    fontSize: 12,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    padding: 16,
    backgroundColor: THEME.colors.background,
  },
  logCard: {
    backgroundColor: THEME.colors.surface,
    padding: 16,
    borderRadius: THEME.radius.md,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  logTime: {
    fontSize: 12,
    color: THEME.colors.textMuted,
    fontWeight: 'bold',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: THEME.radius.sm,
  },
  badgeSuccess: {
    backgroundColor: 'rgba(52, 199, 89, 0.1)',
  },
  badgeError: {
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: THEME.colors.text,
  },
  logName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: THEME.colors.text,
    marginBottom: 4,
  },
  logAction: {
    fontSize: 13,
    color: THEME.colors.textMuted,
    marginBottom: 8,
  },
  logMessage: {
    fontSize: 13,
    color: THEME.colors.text,
    backgroundColor: 'rgba(0,0,0,0.03)',
    padding: 8,
    borderRadius: THEME.radius.sm,
  },
  logMessageError: {
    color: THEME.colors.danger,
    backgroundColor: 'rgba(255, 59, 48, 0.05)',
  },
  emptyText: {
    color: THEME.colors.textMuted,
    textAlign: 'center',
    marginTop: 20,
  },
  errorText: {
    color: THEME.colors.danger,
    textAlign: 'center',
    marginTop: 20,
  },
});
