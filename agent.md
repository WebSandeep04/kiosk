# KiosApp

## Project Overview
KiosApp is a React Native based biometric attendance kiosk application. It is designed to act as an on-device edge AI face recognition terminal for employee attendance tracking (punch in/out). The application is built with an "offline-first" architecture, allowing it to function and authenticate users locally even when network connectivity is lost, syncing data back to a Laravel backend server once online.

## Tech Stack
- **Framework**: React Native (0.85.3) / React (19.2.3)
- **State Management**: Redux Toolkit (`react-redux`, `@reduxjs/toolkit`)
- **Local Storage**: AsyncStorage (`@react-native-async-storage/async-storage`)
- **Camera & AI**: `react-native-vision-camera` paired with a custom Native Module (`FaceRecognitionModule`) for local face detection and embedding extraction.
- **Networking**: Axios for API communication.
- **Language**: TypeScript

## Key Features
1. **Biometric Face Recognition**:
   - Captures frames using the front camera.
   - Leverages ML Kit Face Detection and MobileFaceNet TFLite inference via a custom Native Module.
   - Extracts 128-dimensional face embeddings.
   - Performs real-time Euclidean distance calculations to match the scanned face against cached employee embeddings.

2. **Offline-First Attendance (Punch In/Out)**:
   - Synchronizes employee embeddings from a central Laravel server to local storage.
   - Allows employees to punch in/out without internet access.
   - Stores offline punches in a local queue and automatically pushes them to the server when the connection is restored.

3. **Kiosk UI**:
   - Features a futuristic, neon-styled interface with simulated laser sweeps, holographic face guides, and rich success/failure overlays.
   - Displays real-time daily stats and a live scan log feed.
   - Includes fallback "Simulated" scan capabilities for testing/development.

## Project Structure
- `android/` & `ios/` - Native app code, including the custom `FaceRecognitionModule`.
- `src/` - Main React Native source code:
  - `components/` - Reusable UI components (`Icons.tsx`, `KioskHeader.tsx`, `KioskTabBar.tsx`, `LoadingScreen.tsx`).
  - `constants/` - Theme and configuration constants (`theme.ts`).
  - `screens/` - Main views:
    - `KioskModeScreen.tsx`: Core face scanning and attendance logging view.
    - `EmployeeDirectoryScreen.tsx`: View cached employees.
    - `ServerSetupScreen.tsx`: Configuration for backend URL/API keys.
    - `SettingsScreen.tsx`: General app settings (like distance threshold).
    - `MainLayout.tsx`: Application shell/layout.
  - `services/` - Core business logic:
    - `api.ts`: Axios client for Laravel backend communication.
    - `nativeFaceRecognition.ts`: Bridge to native face embedding extraction.
    - `faceMatcher.ts`: Euclidean distance math for comparing vectors.
    - `storage.ts`: AsyncStorage wrappers for caching employees and offline logs.
  - `store/` - Redux Toolkit slices:
    - `authSlice.ts`, `employeesSlice.ts`, `logsSlice.ts`, `settingsSlice.ts`.
- `App.tsx` - App entry point with context providers (Redux, SafeArea).

## Setup & Running
1. Standard React Native setup required (`npm install`).
2. Run Metro bundler: `npm start`.
3. Run on device/emulator: `npm run android` or `npm run ios`.
   - *Note*: Face recognition requires the native modules to be properly compiled, so building via Xcode/Android Studio or standard run commands is necessary.
