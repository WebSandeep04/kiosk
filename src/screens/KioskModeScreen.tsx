import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Animated,
  ActivityIndicator,
  FlatList,
  Vibration,
  Platform,
  Alert,
} from 'react-native';
import { Camera, useCameraDevice, useCameraPermission, usePhotoOutput } from 'react-native-vision-camera';
import { THEME } from '../constants/theme';
import { storageService, KioskSettings, CachedEmployee } from '../services/storage';
import { apiService, apiClient } from '../services/api';
import { faceMatcherService } from '../services/faceMatcher';
import { nativeFaceRecognition } from '../services/nativeFaceRecognition';
import { CameraIcon, WifiIcon, SyncIcon, CheckIcon, CrossIcon, InfoIcon } from '../components/Icons';
import { useAppDispatch, useAppSelector } from '../store';
import { loadCachedEmployees, syncEmployeesFromServer } from '../store/employeesSlice';
import { loadLocalLogsAndQueue, setOnlineStatus, syncOfflineQueueAction, punchInAction } from '../store/logsSlice';
import { loadSettings } from '../store/settingsSlice';

export default function KioskModeScreen() {
  const dispatch = useAppDispatch();
  const settings = useAppSelector((state) => state.settings);
  const { list: employees } = useAppSelector((state) => state.employees);
  const { logsList: localLogs, offlineQueue, isOnline } = useAppSelector((state) => state.logs);

  const offlineCount = offlineQueue.length;
  const totalPunchesToday = localLogs.filter(
    (l: any) => l.success && (l.action === 'in' || l.action === 'out' || l.action === 'offline_queued')
  ).length;

  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');

  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission]);

  const cameraRef = useRef<any>(null);
  const photoOutput = usePhotoOutput();

  // Punch Success Overlay Modal State
  const [punchOverlayVisible, setPunchOverlayVisible] = useState(false);
  const [matchedEmployeeName, setMatchedEmployeeName] = useState('');
  const [punchAction, setPunchAction] = useState<'in' | 'out'>('in');
  const [punchTime, setPunchTime] = useState('');
  const [punchConfidence, setPunchConfidence] = useState(0);
  const [punchOffline, setPunchOffline] = useState(false);
  const [overlayAnim] = useState(new Animated.Value(0));

  // Live Frame Processing State
  const [liveScanningActive, setLiveScanningActive] = useState(true);
  const [debugMessage, setDebugMessage] = useState<string>('Initializing...');
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string, type: 'error' | 'warning' | 'info' } | null>(null);
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMatchRef = useRef<number>(0);
  const isCapturingRef = useRef<boolean>(false);
  // Multi-frame confirmation: track consecutive matches to the same employee
  const consecutiveMatchRef = useRef<{ employeeId: number; count: number } | null>(null);

  const showFeedback = (text: string, type: 'error' | 'warning' | 'info') => {
    setFeedbackMsg({ text, type });
    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    feedbackTimeoutRef.current = setTimeout(() => {
      setFeedbackMsg(null);
    }, 3000);
  };

  // Background polling for live face matching
  useEffect(() => {
    let active = true;

    const pollCamera = async () => {
      if (!active || !liveScanningActive || !cameraRef.current || isCapturingRef.current || punchOverlayVisible) {
        if (active) setTimeout(pollCamera, 1500);
        return;
      }

      const now = Date.now();
      if (now - lastMatchRef.current < 6000) {
        if (active) setTimeout(pollCamera, 1500);
        return;
      }

      isCapturingRef.current = true;
      try {
        // --- Multi-frame averaging: take 3 frames and average their embeddings ---
        const frameEmbeddings: number[][] = [];
        const FRAMES_TO_SAMPLE = 3;

        for (let f = 0; f < FRAMES_TO_SAMPLE; f++) {
          setDebugMessage(`Capturing frame ${f + 1}/${FRAMES_TO_SAMPLE}...`);
          const photoFile = await photoOutput.capturePhotoToFile({
            flashMode: 'off',
            enableRedEyeReduction: false,
            enableShutterSound: false,
          }, {});

          if (typeof nativeFaceRecognition.extractFaceEmbedding !== 'function') {
            throw new Error('extractFaceEmbedding is not a function');
          }
          const emb = await nativeFaceRecognition.extractFaceEmbedding(photoFile.filePath);
          frameEmbeddings.push(emb);

          // Small gap between frames so they are distinct
          if (f < FRAMES_TO_SAMPLE - 1) {
            await new Promise<void>(resolve => setTimeout(() => resolve(), 300));
          }
        }

        // Average all captured frames into one robust embedding
        setDebugMessage('Averaging frames & matching...');
        const embedding = faceMatcherService.averageEmbeddings(frameEmbeddings);

        if (active && !punchOverlayVisible && (Date.now() - lastMatchRef.current >= 6000)) {
          setDebugMessage(`Matching against ${employees.length} profiles...`);
          const matchResult = faceMatcherService.matchFace(
            embedding,
            employees,
            settings?.distanceThreshold || 0.6
          );

          if (matchResult.employee) {
            const empId = matchResult.employee.employee_id;
            // Consecutive confirmation: need 2 matches to the same employee
            if (consecutiveMatchRef.current?.employeeId === empId) {
              consecutiveMatchRef.current.count++;
            } else {
              consecutiveMatchRef.current = { employeeId: empId, count: 1 };
            }

            if (consecutiveMatchRef.current.count >= 2) {
              // Confirmed match — fire punch
              consecutiveMatchRef.current = null;
              setDebugMessage(`✓ CONFIRMED: ${matchResult.employee.name} (${matchResult.confidence}%)`);
              lastMatchRef.current = Date.now();
              executePunchIn(matchResult.employee, matchResult.confidence);
            } else {
              setDebugMessage(`Candidate: ${matchResult.employee.name} (${matchResult.confidence}%) — confirming...`);
            }
          } else {
            // Reset consecutive counter if no match
            consecutiveMatchRef.current = null;
            const conf = matchResult.confidence;
            setDebugMessage(`No match (best: ${conf}%)`);
            if (conf > 0) {
              showFeedback(`Face not recognized (${conf}% — need 70%+)`, 'error');
            }
          }
        }
      } catch (e: any) {
        const errMsg = e?.message || String(e);
        setDebugMessage(`Error: ${errMsg}`);
        if (errMsg.includes('INVALID_FACE_BOUNDS')) {
          showFeedback('Please center your face in the frame', 'warning');
        }
      } finally {
        isCapturingRef.current = false;
        if (active) setTimeout(pollCamera, 1000); // Poll every 1s
      }
    };

    if (liveScanningActive) {
      setTimeout(pollCamera, 2000);
    }

    return () => {
      active = false;
    };
  }, [liveScanningActive, employees, settings, punchOverlayVisible]);

  const loadData = async () => {
    dispatch(loadSettings());
    dispatch(loadCachedEmployees());
    dispatch(loadLocalLogsAndQueue());

    // Test connectivity
    let isOnline = false;
    try {
      const response = await apiClient.get('/user', { timeout: 5000 });
      isOnline = response.status === 200;
    } catch (e) {
      isOnline = false;
    }
    dispatch(setOnlineStatus(isOnline));
  };

  useEffect(() => {
    loadData();

    // Auto-reload/ping server every 15 seconds to check online status
    const interval = setInterval(async () => {
      let isOnline = false;
      try {
        const response = await apiClient.get('/user', { timeout: 5000 });
        isOnline = response.status === 200;
      } catch (e) {
        isOnline = false;
      }
      dispatch(setOnlineStatus(isOnline));

      // Auto-sync offline queue if connection restored
      if (isOnline) {
        if (offlineQueue.length > 0) {
          await dispatch(syncOfflineQueueAction()).unwrap();
          dispatch(loadLocalLogsAndQueue());
        }
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [dispatch, offlineQueue.length]);

  // Sync Data manually
  const triggerSync = async () => {
    await dispatch(syncEmployeesFromServer()).unwrap();
    dispatch(loadLocalLogsAndQueue());
  };

  const executePunchIn = async (employee: CachedEmployee, confidence: number) => {
    if (!settings?.deviceName || settings.deviceName.trim() === '') {
      showFeedback('Device Name not configured! Please set in Settings.', 'error');
      return;
    }

    setMatchedEmployeeName(employee.name);
    setPunchConfidence(confidence);

    const lat = settings?.latitude || null;
    const lng = settings?.longitude || null;

    try {
      // 1. Dispatch API call to Laravel server
      const res = await dispatch(punchInAction({
        user_id: employee.user_id,
        confidence_match: confidence,
        latitude: lat,
        longitude: lng,
        device_name: settings!.deviceName!,
      })).unwrap();

      if (res.success && res.data) {
        dispatch(setOnlineStatus(true));
        setPunchAction(res.data.action as 'in' | 'out');
        setPunchTime(res.data.time);
        setPunchOffline(false);

        // Log locally
        await storageService.addLocalPunchLog({
          name: employee.name,
          action: res.data.action,
          time: res.data.time,
          success: true,
          message: `Direct API Sync`,
        });
      } else {
        // Server rejected (e.g. duplicate punch-in guard: 429 status)
        Vibration.vibrate(100);
        await storageService.addLocalPunchLog({
          name: employee.name,
          action: 'rejected',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          success: false,
          message: 'Server rejected punch-in.',
        });
        dispatch(loadLocalLogsAndQueue());
        Alert.alert('Error', 'Punch rejected by Magnify.');
        return;
      }
    } catch (err: any) {
      const errMsg = err?.message || (typeof err === 'string' ? err : 'Unknown error');
      const status = err?.status;
      const isBusinessRejection = status === 400 || status === 403 || status === 422 || status === 429;

      if (isBusinessRejection || (typeof err === 'string' && (err.includes('already punched') || err.includes('limit') || err.includes('validation') || err.includes('invalid') || err.includes('Rejected')))) {
        // Explicit business logic rejection from Laravel (e.g. duplicate punch-in guard, worklog, task pending)
        Vibration.vibrate(100);
        await storageService.addLocalPunchLog({
          name: employee.name,
          action: 'rejected',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          success: false,
          message: errMsg,
        });
        dispatch(loadLocalLogsAndQueue());
        Alert.alert('Punch Rejected', errMsg);
        return;
      }

      // 2. Offline fallback queueing if API request fails
      dispatch(setOnlineStatus(false));
      const action = 'offline_queued';

      const offlinePunch = await storageService.addOfflinePunch({
        user_id: employee.user_id,
        name: employee.name,
        confidence_match: confidence,
        latitude: lat,
        longitude: lng,
        device_name: settings!.deviceName!,
      });

      setPunchAction('in'); // Default offline action
      setPunchTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      setPunchOffline(true);
    }

    // Refresh logs and queue in store immediately
    dispatch(loadLocalLogsAndQueue());

    // 3. Play success overlay animation
    Vibration.vibrate([0, 80]);
    showPunchSuccessOverlay();
  };

  const showPunchSuccessOverlay = () => {
    setPunchOverlayVisible(true);
    overlayAnim.setValue(0);
    Animated.spring(overlayAnim, {
      toValue: 1,
      tension: 50,
      friction: 7,
      useNativeDriver: true,
    }).start();

    // Auto dismiss after 2.5s
    setTimeout(() => {
      Animated.timing(overlayAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setPunchOverlayVisible(false);
        loadData();
      });
    }, 2500);
  };

  const renderLogItem = ({ item }: { item: any }) => {
    const isSuccess = item.success;
    const isQueued = item.action === 'offline_queued';
    const initials = item.name?.split(' ').map((n: string) => n[0]).join('').substring(0, 2);

    return (
      <View style={[styles.logCard, !isSuccess && styles.logCardFailed]}>
        <View style={styles.logLeft}>
          <View style={[
            styles.logAvatar,
            isSuccess ? styles.avatarSuccess : styles.avatarFailed,
            isQueued && styles.avatarQueued
          ]}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View>
            <Text style={styles.logName}>{item.name}</Text>
          </View>
        </View>

        <View style={styles.logRight}>
          <View style={[
            styles.actionBadge,
            item.action === 'in' && styles.badgeIn,
            item.action === 'out' && styles.badgeOut,
            isQueued && styles.badgeQueued,
            !isSuccess && styles.badgeFailed,
          ]}>
            <Text style={[
              styles.actionBadgeText,
              item.action === 'in' && { color: THEME.colors.success },
              item.action === 'out' && { color: THEME.colors.accent },
              isQueued && { color: THEME.colors.warning },
              !isSuccess && { color: THEME.colors.danger },
            ]}>
              {item.action === 'in' ? 'IN' : null}
              {item.action === 'out' ? 'OUT' : null}
              {isQueued ? 'QUEUED' : null}
              {item.action === 'match_failed' ? 'MATCH FAILED' : null}
              {item.action === 'rejected' ? 'REJECTED' : null}
            </Text>
          </View>
          <Text style={styles.logTime}>{item.time}</Text>
        </View>
      </View>
    );
  };

  if (!settings) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={THEME.colors.accent} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Dynamic Status Ribbon Header */}
      <View style={styles.statusRibbon}>
        <View style={styles.ribbonLeft}>
          <WifiIcon color={isOnline ? THEME.colors.success : THEME.colors.danger} size={14} active={isOnline} />
          <Text style={[styles.ribbonText, isOnline ? styles.textOnline : styles.textOffline]}>
            {isOnline ? 'MAGNIFY ACTIVE (ONLINE)' : 'OFFLINE MODE (ON-DEVICE AI ACTIVE)'}
          </Text>
        </View>
        <TouchableOpacity style={styles.syncStatusBtn} onPress={triggerSync}>
          <SyncIcon color={THEME.colors.textMuted} size={12} />
          <Text style={styles.syncStatusText}>Embeddings cached: {employees.length}</Text>
        </TouchableOpacity>
      </View>

      {/* Main Grid View */}
      <ScrollView contentContainerStyle={styles.mainLayout} showsVerticalScrollIndicator={false}>
        {/* Left Pane: Camera viewport & Simulator */}
        <View style={styles.leftPane}>
          <View style={styles.cameraFrameCard}>
            <View style={styles.scannerWrapper}>
              {device != null && hasPermission ? (
                <Camera
                  ref={cameraRef}
                  style={StyleSheet.absoluteFill}
                  device={device}
                  isActive={true}
                  outputs={[photoOutput]}
                />
              ) : null}

              {/* Neon border bounds corners */}
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />

              {/* Holographic face guide circles */}
              <View style={styles.guideOval} />
              <View style={styles.guideCircle} />

              {/* Static overlay instructions */}
              <View style={styles.scannerPrompt}>
                <CameraIcon color={THEME.colors.textMuted} size={16} />
                <Text style={styles.scannerPromptText}>
                  ALIGN FACE TO SCAN
                </Text>
              </View>

              {/* User Feedback Message Overlay */}
              {feedbackMsg && (
                <View style={{
                  position: 'absolute',
                  top: '15%',
                  backgroundColor: feedbackMsg.type === 'error' ? 'rgba(239, 68, 68, 0.9)' : 'rgba(245, 158, 11, 0.9)',
                  paddingHorizontal: 24,
                  paddingVertical: 12,
                  borderRadius: 30,
                  alignSelf: 'center',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.5,
                  shadowRadius: 5,
                  elevation: 6,
                }}>
                  <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14, letterSpacing: 0.5 }}>
                    {feedbackMsg.text}
                  </Text>
                </View>
              )}

              <View style={{ position: 'absolute', bottom: 10, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.6)', padding: 8, borderRadius: 8 }}>
                <Text style={{ color: '#00FFCC', fontSize: 12, fontWeight: 'bold' }}>{debugMessage}</Text>
              </View>
            </View>
          </View>

        </View>

        {/* Right Pane: Stats & Local Live Feed */}
        <View style={styles.rightPane}>


          {/* Live Scan Log Feed */}
          <View style={styles.feedCard}>
            <Text style={styles.feedTitle}>LIVE ATTENDANCE FEED</Text>
            <FlatList
              data={localLogs.filter(log => log.success && (log.action === 'in' || log.action === 'out'))}
              keyExtractor={(item) => item.id}
              renderItem={renderLogItem}
              scrollEnabled={false} // FlatList nested in ScrollView
              ListEmptyComponent={
                <View style={styles.emptyFeed}>
                  <InfoIcon color={THEME.colors.textMuted} size={20} />
                  <Text style={styles.emptyFeedText}>No scans logged today. Awaiting activity.</Text>
                </View>
              }
            />
          </View>
        </View>
      </ScrollView>

      {/* 🟢 GORGEOUS FULL-SCREEN NEON PUNCH SUCCESS OVERLAY */}
      {punchOverlayVisible && (
        <Animated.View
          style={[
            styles.punchOverlay,
            {
              opacity: overlayAnim,
              transform: [
                {
                  scale: overlayAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.95, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.successRingsContainer}>
            <View style={styles.outerRing} />
            <View style={styles.innerRing} />
            <View style={styles.successCircle}>
              <CheckIcon color="#FFF" size={48} />
            </View>
          </View>

          <Text style={styles.successTitle}>VERIFIED IDENTITY</Text>
          <Text style={styles.successName}>{matchedEmployeeName}</Text>

          <View style={styles.punchActionContainer}>
            <Text style={styles.punchActionLabel}>LOGGED SUCCESS:</Text>
            <View style={[styles.successActionBadge, punchAction === 'out' && styles.successActionBadgeOut]}>
              <Text style={styles.successActionText}>{punchAction.toUpperCase()}</Text>
            </View>
          </View>

          <View style={styles.successStatsRow}>
            <View style={styles.successStatCol}>
              <Text style={styles.successStatVal}>{punchTime}</Text>
              <Text style={styles.successStatLbl}>TIME LOGGED</Text>
            </View>
            <View style={styles.successStatCol}>
              <Text style={styles.successStatVal}>{punchConfidence}%</Text>
              <Text style={styles.successStatLbl}>MATCH CONFIDENCE</Text>
            </View>
          </View>

          {punchOffline && (
            <View style={styles.offlineBanner}>
              <Text style={styles.offlineBannerText}>
                ⚠️ Saved locally to offline queue (Laravel server offline).
              </Text>
            </View>
          )}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  statusRibbon: {
    backgroundColor: THEME.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ribbonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: THEME.spacing.xs,
  },
  ribbonText: {
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  textOnline: {
    color: THEME.colors.success,
  },
  textOffline: {
    color: THEME.colors.warning,
  },
  syncStatusBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: THEME.spacing.xs,
  },
  syncStatusText: {
    color: THEME.colors.textMuted,
    fontSize: 11,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: THEME.colors.background,
  },
  mainLayout: {
    padding: THEME.spacing.md,
    gap: THEME.spacing.md,
  },
  leftPane: {
    flex: 1,
    gap: THEME.spacing.md,
  },
  rightPane: {
    flex: 1,
    gap: THEME.spacing.md,
  },
  // Scanner View
  cameraFrameCard: {
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: THEME.radius.lg,
    overflow: 'hidden',
    aspectRatio: 4 / 3,
  },
  scannerWrapper: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Corners
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: THEME.colors.accent,
  },
  topLeft: {
    top: 24,
    left: 24,
    borderTopWidth: 3,
    borderLeftWidth: 3,
  },
  topRight: {
    top: 24,
    right: 24,
    borderTopWidth: 3,
    borderRightWidth: 3,
  },
  bottomLeft: {
    bottom: 24,
    left: 24,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
  },
  bottomRight: {
    bottom: 24,
    right: 24,
    borderBottomWidth: 3,
    borderRightWidth: 3,
  },
  // Guides
  guideOval: {
    width: '55%',
    height: '70%',
    borderRadius: 160,
    borderWidth: 1.5,
    borderColor: 'rgba(6, 182, 212, 0.25)',
    borderStyle: 'dashed',
  },
  guideOvalScanning: {
    borderColor: THEME.colors.accent,
  },
  guideCircle: {
    position: 'absolute',
    width: '45%',
    height: '58%',
    borderRadius: 140,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.15)',
  },
  guideCircleScanning: {
    borderColor: THEME.colors.primary,
  },
  // Laser
  scannerLaser: {
    position: 'absolute',
    left: '10%',
    right: '10%',
    height: 3,
    backgroundColor: THEME.colors.accent,
    shadowColor: THEME.colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 8,
  },
  scannerPrompt: {
    position: 'absolute',
    bottom: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: THEME.spacing.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderWidth: 1,
    borderColor: THEME.colors.border,
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.xs,
    borderRadius: THEME.radius.round,
  },
  scannerPromptText: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 1.5,
  },
  // Simulator Card
  simulatorCard: {
    backgroundColor: THEME.colors.surfaceGlass,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: THEME.radius.lg,
    padding: THEME.spacing.md,
  },
  simHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: THEME.spacing.xs,
  },
  simTitle: {
    color: THEME.colors.text,
    fontSize: 15,
    fontWeight: 'bold',
  },
  simBadge: {
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderWidth: 1,
    borderColor: THEME.colors.primary,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  simBadgeText: {
    color: THEME.colors.primaryLight,
    fontSize: 9,
    fontWeight: 'bold',
  },
  simDesc: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
    marginBottom: THEME.spacing.md,
  },
  simSelectorRow: {
    flexDirection: 'row',
    gap: THEME.spacing.sm,
  },
  pickerTrigger: {
    flex: 3,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: THEME.radius.md,
    paddingHorizontal: THEME.spacing.md,
    justifyContent: 'space-between',
    alignItems: 'center',
    flexDirection: 'row',
    height: 44,
  },
  pickerTriggerText: {
    color: THEME.colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  pickerTriggerArrow: {
    color: THEME.colors.textMuted,
    fontSize: 10,
  },
  simScanBtn: {
    flex: 2,
    backgroundColor: THEME.colors.accent,
    borderRadius: THEME.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    height: 44,
  },
  simScanBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  emptyEmployeesBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(245, 158, 11, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.2)',
    borderRadius: THEME.radius.md,
    padding: THEME.spacing.sm,
    gap: THEME.spacing.sm,
    alignItems: 'center',
  },
  emptyEmployeesText: {
    color: THEME.colors.warning,
    fontSize: 11,
    flex: 1,
  },
  // Picker dropdown styles
  pickerDropdown: {
    marginTop: THEME.spacing.xs,
    backgroundColor: THEME.colors.surface,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: THEME.radius.md,
    maxHeight: 200,
    overflow: 'hidden',
  },
  pickerScroll: {
    padding: THEME.spacing.xs,
  },
  pickerItem: {
    paddingVertical: THEME.spacing.sm,
    paddingHorizontal: THEME.spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(0,0,0,0.05)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pickerItemActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
  },
  pickerItemText: {
    color: THEME.colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  pickerItemSub: {
    color: THEME.colors.textMuted,
    fontSize: 11,
  },
  // Stats
  statsBar: {
    flexDirection: 'row',
    backgroundColor: THEME.colors.surfaceGlass,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: THEME.radius.lg,
    paddingVertical: THEME.spacing.md,
  },
  statWidget: {
    flex: 1,
    alignItems: 'center',
  },
  statWidgetBorder: {
    width: 1,
    backgroundColor: THEME.colors.border,
  },
  statVal: {
    color: THEME.colors.text,
    fontSize: 24,
    fontWeight: '900',
  },
  statLbl: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  // Feed
  feedCard: {
    backgroundColor: THEME.colors.surfaceGlass,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: THEME.radius.lg,
    padding: THEME.spacing.md,
  },
  feedTitle: {
    color: THEME.colors.primaryLight,
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: THEME.spacing.md,
  },
  emptyFeed: {
    alignItems: 'center',
    paddingVertical: THEME.spacing.xl,
    gap: THEME.spacing.sm,
  },
  emptyFeedText: {
    color: THEME.colors.textMuted,
    fontSize: 12,
  },
  logCard: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: THEME.radius.md,
    padding: THEME.spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: THEME.spacing.xs,
  },
  logCardFailed: {
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  logLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: THEME.spacing.sm,
  },
  logAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarSuccess: {
    backgroundColor: THEME.colors.successGlass,
  },
  avatarFailed: {
    backgroundColor: THEME.colors.dangerGlass,
  },
  avatarQueued: {
    backgroundColor: THEME.colors.warningGlass,
  },
  avatarText: {
    color: THEME.colors.text,
    fontSize: 12,
    fontWeight: 'bold',
  },
  logName: {
    color: THEME.colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  logRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  actionBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeIn: {
    backgroundColor: THEME.colors.successGlass,
  },
  badgeOut: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
  },
  badgeQueued: {
    backgroundColor: THEME.colors.warningGlass,
  },
  badgeFailed: {
    backgroundColor: THEME.colors.dangerGlass,
  },
  actionBadgeText: {
    fontSize: 9,
    fontWeight: 'bold',
  },
  logTime: {
    color: THEME.colors.textMuted,
    fontSize: 10,
  },
  // 🟢 Punch Success Overlay Modal
  punchOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    zIndex: 9999,
    justifyContent: 'center',
    alignItems: 'center',
    padding: THEME.spacing.xl,
  },
  successRingsContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: THEME.spacing.lg,
  },
  outerRing: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
    borderColor: THEME.colors.success,
    opacity: 0.15,
  },
  innerRing: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 1.5,
    borderColor: THEME.colors.success,
    opacity: 0.3,
  },
  successCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: THEME.colors.success,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: THEME.colors.success,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 15,
    elevation: 15,
  },
  successTitle: {
    color: THEME.colors.success,
    fontSize: 15,
    fontWeight: 'bold',
    letterSpacing: 3,
    marginBottom: THEME.spacing.xs,
  },
  successName: {
    color: THEME.colors.text,
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  punchActionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: THEME.spacing.sm,
    marginTop: THEME.spacing.md,
    marginBottom: THEME.spacing.xl,
  },
  punchActionLabel: {
    color: THEME.colors.textMuted,
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  successActionBadge: {
    backgroundColor: THEME.colors.successGlass,
    borderWidth: 1,
    borderColor: THEME.colors.success,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  successActionBadgeOut: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderColor: THEME.colors.accent,
  },
  successActionText: {
    color: THEME.colors.text,
    fontSize: 12,
    fontWeight: 'bold',
  },
  successStatsRow: {
    flexDirection: 'row',
    gap: THEME.spacing.xxl,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(0,0,0,0.08)',
    paddingTop: THEME.spacing.lg,
    width: '100%',
    maxWidth: 320,
    justifyContent: 'space-around',
  },
  successStatCol: {
    alignItems: 'center',
  },
  successStatVal: {
    color: THEME.colors.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  successStatLbl: {
    color: THEME.colors.textMuted,
    fontSize: 10,
    fontWeight: 'bold',
    marginTop: 4,
  },
  offlineBanner: {
    position: 'absolute',
    bottom: 40,
    backgroundColor: THEME.colors.warningGlass,
    borderWidth: 1,
    borderColor: THEME.colors.warning,
    borderRadius: THEME.radius.md,
    paddingVertical: THEME.spacing.sm,
    paddingHorizontal: THEME.spacing.md,
  },
  offlineBannerText: {
    color: THEME.colors.warning,
    fontSize: 11,
    fontWeight: 'bold',
  },
});
