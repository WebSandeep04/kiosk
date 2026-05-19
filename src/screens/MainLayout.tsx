import React, { useState, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppDispatch, useAppSelector } from '../store';
import { loadSettings } from '../store/settingsSlice';
import { THEME } from '../constants/theme';
import ServerSetupScreen from './ServerSetupScreen';
import KioskModeScreen from './KioskModeScreen';
import EmployeeDirectoryScreen from './EmployeeDirectoryScreen';
import SettingsScreen from './SettingsScreen';
import KioskHeader from '../components/KioskHeader';
import KioskTabBar from '../components/KioskTabBar';
import LoadingScreen from '../components/LoadingScreen';

export default function MainLayout() {
  const safeAreaInsets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const { serverUrl } = useAppSelector((state) => state.settings);

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'kiosk' | 'directory' | 'settings'>('kiosk');
  const [serverDomain, setServerDomain] = useState('');

  useEffect(() => {
    dispatch(loadSettings()).unwrap().finally(() => {
      setLoading(false);
    });
  }, [dispatch]);

  useEffect(() => {
    if (serverUrl) {
      const match = serverUrl.match(/^(?:https?:\/\/)?(?:www\.)?([^\/:]+)/i);
      setServerDomain(match && match[1] ? match[1].toUpperCase() : 'CLOUD SERVER');
    }
  }, [serverUrl]);

  const handleSetupComplete = () => {
    dispatch(loadSettings());
    setActiveTab('kiosk');
  };

  const handleLogout = () => {
    dispatch(loadSettings());
    setActiveTab('kiosk');
  };

  const isConfigured = !!serverUrl;

  if (loading) {
    return <LoadingScreen message="Initializing Edge-AI Engine..." />;
  }

  // Gateway Setup Screen Gate
  if (!isConfigured) {
    return (
      <View style={[styles.container, { paddingTop: safeAreaInsets.top }]}>
        <ServerSetupScreen onSetupComplete={handleSetupComplete} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: safeAreaInsets.top }]}>
      {/* Premium Modular Kiosk Header */}
      <KioskHeader serverDomain={serverDomain} />

      {/* Screen Render Body */}
      <View style={styles.screenBody}>
        {activeTab === 'kiosk' && <KioskModeScreen />}
        {activeTab === 'directory' && <EmployeeDirectoryScreen />}
        {activeTab === 'settings' && <SettingsScreen onLogout={handleLogout} />}
      </View>

      {/* Modern High-Aesthetic Tab bar */}
      <KioskTabBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        bottomPadding={(safeAreaInsets.bottom || 0) + 38}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  screenBody: {
    flex: 1,
    paddingBottom: 15,
  },
});
