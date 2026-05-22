import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { THEME } from '../constants/theme';
import { storageService } from '../services/storage';
import { CrossIcon } from '../components/Icons';

interface DatabaseViewerProps {
  visible: boolean;
  onClose: () => void;
}

export default function DatabaseViewerScreen({ visible, onClose }: DatabaseViewerProps) {
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableData, setTableData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      loadTables();
    }
  }, [visible]);

  const loadTables = async () => {
    try {
      setLoading(true);
      setError(null);
      const rows = await storageService.executeRawQuery("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
      setTables(rows.map(r => r.name));
      if (rows.length > 0) {
        loadTableData(rows[0].name);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load tables');
    } finally {
      setLoading(false);
    }
  };

  const loadTableData = async (tableName: string) => {
    try {
      setLoading(true);
      setError(null);
      setSelectedTable(tableName);
      const rows = await storageService.executeRawQuery(`SELECT * FROM ${tableName} LIMIT 100`);
      setTableData(rows);
    } catch (err: any) {
      setError(err.message || `Failed to load data for ${tableName}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Raw Database Viewer</Text>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <CrossIcon color={THEME.colors.text} size={24} />
          </TouchableOpacity>
        </View>

        {loading && !tables.length ? (
          <ActivityIndicator style={{ marginTop: 20 }} size="large" color={THEME.colors.accent} />
        ) : (
          <View style={styles.body}>
            {/* Table Selection Sidebar */}
            <View style={styles.sidebar}>
              <ScrollView>
                <Text style={styles.sidebarTitle}>Tables</Text>
                {tables.map(table => (
                  <TouchableOpacity 
                    key={table} 
                    style={[styles.tableItem, selectedTable === table && styles.tableItemActive]}
                    onPress={() => loadTableData(table)}
                  >
                    <Text style={[styles.tableItemText, selectedTable === table && styles.tableItemTextActive]}>
                      {table}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Data Grid */}
            <View style={styles.content}>
              {loading && tables.length > 0 ? (
                <ActivityIndicator style={{ marginTop: 20 }} size="large" color={THEME.colors.accent} />
              ) : error ? (
                <Text style={styles.errorText}>{error}</Text>
              ) : tableData.length === 0 ? (
                <Text style={styles.emptyText}>Table is empty.</Text>
              ) : (
                <ScrollView horizontal>
                  <ScrollView>
                    {/* Headers */}
                    <View style={styles.row}>
                      {Object.keys(tableData[0] || {}).map((key) => (
                        <View key={key} style={styles.headerCell}>
                          <Text style={styles.headerCellText}>{key}</Text>
                        </View>
                      ))}
                    </View>
                    {/* Rows */}
                    {tableData.map((row, index) => (
                      <View key={index} style={[styles.row, index % 2 === 1 && styles.rowAlt]}>
                        {Object.values(row).map((val: any, idx) => (
                          <View key={idx} style={styles.cell}>
                            <Text style={styles.cellText}>{val === null ? 'NULL' : String(val)}</Text>
                          </View>
                        ))}
                      </View>
                    ))}
                  </ScrollView>
                </ScrollView>
              )}
            </View>
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
  body: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    width: 150,
    backgroundColor: THEME.colors.background,
    borderRightWidth: 1,
    borderRightColor: THEME.colors.border,
  },
  sidebarTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: THEME.colors.textMuted,
    textTransform: 'uppercase',
    padding: 16,
  },
  tableItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
  },
  tableItemActive: {
    backgroundColor: 'rgba(67, 74, 250, 0.1)',
    borderLeftWidth: 3,
    borderLeftColor: THEME.colors.accent,
  },
  tableItemText: {
    fontSize: 14,
    color: THEME.colors.text,
  },
  tableItemTextActive: {
    color: THEME.colors.accent,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
  },
  rowAlt: {
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  headerCell: {
    padding: 12,
    width: 150,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  headerCellText: {
    fontWeight: 'bold',
    fontSize: 12,
    color: THEME.colors.textMuted,
  },
  cell: {
    padding: 12,
    width: 150,
  },
  cellText: {
    fontSize: 12,
    color: THEME.colors.text,
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
