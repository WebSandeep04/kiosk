import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { THEME } from '../constants/theme';
import { CameraIcon, UsersIcon, SettingsIcon } from './Icons';

interface KioskTabBarProps {
  activeTab: 'kiosk' | 'directory' | 'settings';
  setActiveTab: (tab: 'kiosk' | 'directory' | 'settings') => void;
  bottomPadding: number;
}

export default function KioskTabBar({ activeTab, setActiveTab, bottomPadding }: KioskTabBarProps) {
  return (
    <View style={[styles.tabBar, { paddingBottom: bottomPadding }]}>
      <TouchableOpacity
        style={[styles.tabItem, activeTab === 'kiosk' && styles.tabItemActive]}
        onPress={() => setActiveTab('kiosk')}
      >
        <CameraIcon color={activeTab === 'kiosk' ? THEME.colors.accent : THEME.colors.textMuted} size={18} />
        <Text style={[styles.tabText, activeTab === 'kiosk' && styles.tabTextActive]}>Kiosk Feed</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.tabItem, activeTab === 'directory' && styles.tabItemActive]}
        onPress={() => setActiveTab('directory')}
      >
        <UsersIcon color={activeTab === 'directory' ? THEME.colors.accent : THEME.colors.textMuted} size={18} />
        <Text style={[styles.tabText, activeTab === 'directory' && styles.tabTextActive]}>Employees</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.tabItem, activeTab === 'settings' && styles.tabItemActive]}
        onPress={() => setActiveTab('settings')}
      >
        <SettingsIcon color={activeTab === 'settings' ? THEME.colors.accent : THEME.colors.textMuted} size={18} />
        <Text style={[styles.tabText, activeTab === 'settings' && styles.tabTextActive]}>Settings</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#07090e',
    borderTopWidth: 1,
    borderTopColor: THEME.colors.border,
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: 12,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 4,
  },
  tabItemActive: {
    borderTopWidth: 2,
    borderTopColor: THEME.colors.accent,
    paddingTop: 4,
  },
  tabText: {
    color: THEME.colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 3,
  },
  tabTextActive: {
    color: THEME.colors.accent,
    fontWeight: 'bold',
  },
});
