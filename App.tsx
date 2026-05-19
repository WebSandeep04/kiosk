import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider } from 'react-redux';
import { store } from './src/store';
import MainLayout from './src/screens/MainLayout';
import { THEME } from './src/constants/theme';

export default function App() {
  return (
    <Provider store={store}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor={THEME.colors.background} />
        <MainLayout />
      </SafeAreaProvider>
    </Provider>
  );
}
