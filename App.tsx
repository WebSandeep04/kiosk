import React, { useEffect, useState } from 'react';
import { StatusBar, ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider } from 'react-redux';
import { store } from './src/store';
import MainLayout from './src/screens/MainLayout';
import { THEME } from './src/constants/theme';
import { storageService } from './src/services/storage';

export default function App() {
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    storageService.initDB()
      .then(() => setDbReady(true))
      .catch((err) => {
        console.error('Failed to initialize local database:', err);
        setDbReady(true); // Fallback to avoid complete lock
      });
  }, []);

  if (!dbReady) {
    return (
      <View style={{ flex: 1, backgroundColor: THEME.colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={THEME.colors.accent} />
      </View>
    );
  }

  return (
    <Provider store={store}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor={THEME.colors.background} />
        <MainLayout />
      </SafeAreaProvider>
    </Provider>
  );
}
