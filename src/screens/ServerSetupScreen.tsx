import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { useDispatch } from 'react-redux';
import { THEME } from '../constants/theme';
import { storageService } from '../services/storage';
import { GATEWAY_URL } from '../services/api';
import { KeyIcon, UsersIcon } from '../components/Icons';
import { syncEmployeesFromServer } from '../store/employeesSlice';
import { kioskLoginAction } from '../store/authSlice';
import { updateSettings } from '../store/settingsSlice';

interface ServerSetupScreenProps {
  onSetupComplete: () => void;
}

export default function ServerSetupScreen({ onSetupComplete }: ServerSetupScreenProps) {
  const dispatch = useDispatch<any>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [adminPin, setAdminPin] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSaveAndProceed = async () => {
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      Alert.alert('Validation Error', 'Please enter all Login details.');
      return;
    }

    const trimmedPin = adminPin.trim();
    if (trimmedPin.length !== 4 || !/^\d+$/.test(trimmedPin)) {
      Alert.alert('Validation Error', 'Admin PIN must be exactly 4 digits.');
      return;
    }

    setSaving(true);

    try {
      // 1. Direct Kiosk Authentication Check (Dispatches the proper slice action)
      await dispatch(kioskLoginAction({
        email: trimmedEmail,
        password: trimmedPassword
      })).unwrap();

      // Save the Admin PIN to local settings
      await dispatch(updateSettings({ adminPin: trimmedPin })).unwrap();

      // 2. Perform initial background sync of employee biometric vectors
      try {
        await dispatch(syncEmployeesFromServer()).unwrap();
      } catch (e) {
        // ignore background sync warnings during setup
      }

      onSetupComplete();
    } catch (err: any) {
      Alert.alert('Authentication Failed', err.message || err || 'Could not verify connection properties.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logoText}>🚀 WORKORIO KIOSK SYSTEM</Text>
          <Text style={styles.title}>WORKORIO MAGNIFY MODE</Text>
          <Text style={styles.subtitle}>Direct Edge-Computing Integration Terminal</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Gateway Configuration</Text>
          <Text style={styles.cardDesc}>
            Connect this terminal to the Workorio production network. Credentials will be securely verified inside your isolated tenant database in real-time.
          </Text>

          {/* 1. Email */}
          <View style={styles.inputGroup}>
            <View style={styles.inputLabelContainer}>
              <UsersIcon color={THEME.colors.accent} size={16} />
              <Text style={styles.inputLabel}>Administrator Email</Text>
            </View>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="e.g., admin@workorio.com"
              placeholderTextColor={THEME.colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* 3. Password */}
          <View style={styles.inputGroup}>
            <View style={styles.inputLabelContainer}>
              <KeyIcon color={THEME.colors.accent} size={16} />
              <Text style={styles.inputLabel}>Administrator Password</Text>
            </View>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Enter password..."
              placeholderTextColor={THEME.colors.textMuted}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Admin PIN */}
          <View style={styles.inputGroup}>
            <View style={styles.inputLabelContainer}>
              <KeyIcon color={THEME.colors.accent} size={16} />
              <Text style={styles.inputLabel}>Create Kiosk Admin PIN</Text>
            </View>
            <TextInput
              style={styles.input}
              value={adminPin}
              onChangeText={setAdminPin}
              placeholder="4-digit PIN (e.g. 1234)"
              placeholderTextColor={THEME.colors.textMuted}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
            />
            <Text style={styles.helpText}>This PIN is required to access Settings and Employees tabs.</Text>
          </View>

          <TouchableOpacity
            style={[styles.btnFull, saving && styles.btnDisabled]}
            onPress={handleSaveAndProceed}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <Text style={styles.btnFullText}>Authorize & Launch Kiosk Mode</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  scrollContainer: {
    padding: THEME.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
  },
  header: {
    alignItems: 'center',
    marginBottom: THEME.spacing.xl,
  },
  logoText: {
    color: THEME.colors.primary,
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 2,
    marginBottom: THEME.spacing.xs,
  },
  title: {
    color: THEME.colors.text,
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 1,
  },
  subtitle: {
    color: THEME.colors.textMuted,
    fontSize: 14,
    marginTop: THEME.spacing.xs,
  },
  card: {
    backgroundColor: THEME.colors.surfaceGlass,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: THEME.radius.lg,
    padding: THEME.spacing.lg,
    width: '100%',
    maxWidth: 550,
  },
  cardTitle: {
    color: THEME.colors.text,
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: THEME.spacing.xs,
  },
  cardDesc: {
    color: THEME.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: THEME.spacing.lg,
  },
  inputGroup: {
    marginBottom: THEME.spacing.md,
  },
  inputLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: THEME.spacing.sm,
  },
  inputLabel: {
    color: THEME.colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    marginLeft: THEME.spacing.sm,
  },
  input: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: THEME.radius.md,
    color: THEME.colors.text,
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.sm,
    fontSize: 14,
  },
  helpText: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    marginTop: THEME.spacing.xs,
  },
  btnFull: {
    width: '100%',
    height: 48,
    borderRadius: THEME.radius.md,
    backgroundColor: THEME.colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: THEME.spacing.lg,
  },
  btnFullText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFF',
  },
  btnDisabled: {
    opacity: 0.5,
  },
});
