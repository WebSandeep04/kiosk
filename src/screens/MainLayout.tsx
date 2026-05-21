import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Modal, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Alert } from 'react-native';
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
import { KeyIcon, CrossIcon } from '../components/Icons';

export default function MainLayout() {
  const safeAreaInsets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const { serverUrl, adminPin } = useAppSelector((state) => state.settings);

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'kiosk' | 'directory' | 'settings'>('kiosk');
  const [serverDomain, setServerDomain] = useState('');

  // Admin PIN Lock State
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [pendingTab, setPendingTab] = useState<'directory' | 'settings' | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

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
    setIsUnlocked(false);
    setActiveTab('kiosk');
  };

  const handleTabChange = (tab: 'kiosk' | 'directory' | 'settings') => {
    if (tab === 'kiosk') {
      // Always allow returning to kiosk feed and immediately lock
      setIsUnlocked(false);
      setActiveTab('kiosk');
      return;
    }

    if (isUnlocked || !adminPin) {
      // Already unlocked or no PIN configured yet
      setActiveTab(tab);
    } else {
      // Requires PIN
      setPendingTab(tab);
      setPinInput('');
      setPinError('');
      setPinModalVisible(true);
    }
  };

  const handlePinSubmit = () => {
    if (pinInput === adminPin) {
      setIsUnlocked(true);
      if (pendingTab) setActiveTab(pendingTab);
      setPinModalVisible(false);
    } else {
      setPinError('Incorrect PIN. Access Denied.');
      setPinInput('');
    }
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
        setActiveTab={handleTabChange}
        bottomPadding={safeAreaInsets.bottom || 8}
      />

      {/* Admin PIN Lock Modal */}
      <Modal visible={pinModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.pinCard}>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setPinModalVisible(false)}>
              <CrossIcon color={THEME.colors.textMuted} size={20} />
            </TouchableOpacity>

            <View style={styles.pinHeader}>
              <View style={styles.iconCircle}>
                <KeyIcon color={THEME.colors.accent} size={24} />
              </View>
              <Text style={styles.pinTitle}>Admin Access Required</Text>
              <Text style={styles.pinDesc}>Please enter your 4-digit security PIN to unlock restricted areas.</Text>
            </View>

            <TextInput
              style={styles.pinInput}
              value={pinInput}
              onChangeText={(val) => {
                setPinInput(val);
                setPinError('');
              }}
              placeholder="Enter PIN"
              placeholderTextColor={THEME.colors.textMuted}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
              autoFocus
            />

            {!!pinError && <Text style={styles.errorText}>{pinError}</Text>}

            <TouchableOpacity style={styles.unlockBtn} onPress={handlePinSubmit}>
              <Text style={styles.unlockBtnText}>Unlock Access</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: THEME.spacing.xl,
  },
  pinCard: {
    backgroundColor: THEME.colors.surface,
    borderRadius: THEME.radius.lg,
    padding: THEME.spacing.xl,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 8,
  },
  pinHeader: {
    alignItems: 'center',
    marginBottom: THEME.spacing.lg,
    marginTop: THEME.spacing.sm,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(67, 74, 250, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: THEME.spacing.md,
  },
  pinTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: THEME.colors.text,
    marginBottom: THEME.spacing.xs,
  },
  pinDesc: {
    fontSize: 13,
    color: THEME.colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  pinInput: {
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: THEME.radius.md,
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    paddingVertical: 16,
    letterSpacing: 8,
    color: THEME.colors.text,
    marginBottom: THEME.spacing.md,
  },
  errorText: {
    color: THEME.colors.danger,
    fontSize: 13,
    marginBottom: THEME.spacing.md,
    textAlign: 'center',
  },
  unlockBtn: {
    width: '100%',
    backgroundColor: THEME.colors.accent,
    paddingVertical: 14,
    borderRadius: THEME.radius.md,
    alignItems: 'center',
  },
  unlockBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
