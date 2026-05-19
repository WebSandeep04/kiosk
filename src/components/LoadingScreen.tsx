import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { THEME } from '../constants/theme';

interface LoadingScreenProps {
  message?: string;
}

export default function LoadingScreen({ message = 'Initializing Edge-AI Engine...' }: LoadingScreenProps) {
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator color={THEME.colors.accent} size="large" />
      <Text style={styles.loadingText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: THEME.colors.background,
  },
  loadingText: {
    color: THEME.colors.textMuted,
    fontSize: 12,
    marginTop: THEME.spacing.sm,
  },
});
