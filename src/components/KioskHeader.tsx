import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { THEME } from '../constants/theme';

interface KioskHeaderProps {
  serverDomain: string;
}

export default function KioskHeader({ serverDomain }: KioskHeaderProps) {
  return (
    <View style={styles.appHeader}>
      <View>
        <Text style={styles.headerTitle}>WORKORIO MAGNIFY</Text>
        <Text style={styles.headerSubtitle}>EDGE AUTOMATED ATTENDANCE</Text>
      </View>

      <View style={styles.serverInfoCard}>
        <View style={styles.greenPulse} />
        <Text style={styles.serverDomainText}>{serverDomain}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  appHeader: {
    height: 60,
    backgroundColor: THEME.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
    paddingHorizontal: THEME.spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    color: THEME.colors.text,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  headerSubtitle: {
    color: THEME.colors.accent,
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginTop: 1,
  },
  serverInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderWidth: 1,
    borderColor: THEME.colors.border,
    paddingHorizontal: THEME.spacing.sm,
    paddingVertical: THEME.spacing.xs - 2,
    borderRadius: THEME.radius.sm,
    gap: THEME.spacing.xs,
  },
  greenPulse: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: THEME.colors.success,
  },
  serverDomainText: {
    color: THEME.colors.textMuted,
    fontSize: 10,
    fontWeight: 'bold',
  },
});
