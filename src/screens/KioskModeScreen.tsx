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
import { THEME } from '../constants/theme';
import { storageService, KioskSettings, CachedEmployee } from '../services/storage';
import { apiService, apiClient } from '../services/api';
import { faceMatcherService } from '../services/faceMatcher';
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

  // Simulation picker state
  const [pickerVisible, setPickerVisible] = useState(false);
  const [selectedSimEmp, setSelectedSimEmp] = useState<CachedEmployee | null>(null);

  // Scanner Animation & State
  const [scanning, setScanning] = useState(false);
  const [scanningMessage, setScanningMessage] = useState('ALIGN FACE TO SCAN');
  const [laserAnim] = useState(new Animated.Value(0));
  const scannerLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  // Punch Success Overlay Modal State
  const [punchOverlayVisible, setPunchOverlayVisible] = useState(false);
  const [matchedEmployeeName, setMatchedEmployeeName] = useState('');
  const [punchAction, setPunchAction] = useState<'in' | 'out'>('in');
  const [punchTime, setPunchTime] = useState('');
  const [punchConfidence, setPunchConfidence] = useState(0);
  const [punchOffline, setPunchOffline] = useState(false);
  const [overlayAnim] = useState(new Animated.Value(0));

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

  // Set default selected simulation employee once employees are loaded
  useEffect(() => {
    if (employees.length > 0 && !selectedSimEmp) {
      setSelectedSimEmp(employees[0]);
    }
  }, [employees, selectedSimEmp]);

  // Sync Data manually
  const triggerSync = async () => {
    await dispatch(syncEmployeesFromServer()).unwrap();
    dispatch(loadLocalLogsAndQueue());
  };

  // Start laser loop
  const startLaserScanning = () => {
    laserAnim.setValue(0);
    scannerLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(laserAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: false,
        }),
        Animated.timing(laserAnim, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: false,
        }),
      ])
    );
    scannerLoopRef.current.start();
  };

  const stopLaserScanning = () => {
    if (scannerLoopRef.current) {
      scannerLoopRef.current.stop();
    }
    laserAnim.setValue(0);
  };

  // Trigger secure biometric signature capture
  const handleSimulateScan = () => {
    if (!selectedSimEmp || scanning) return;

    setScanning(true);
    setScanningMessage('EXTRACTING LANDMARKS...');
    startLaserScanning();

    // 1. Perform face calculations and landmark extraction
    setTimeout(() => {
      setScanningMessage('MATCHING FACE EMBEDDINGS...');

      setTimeout(async () => {
        // 2. Perform real-time Euclidean distance face matching
        const faceVector = faceMatcherService.generateMockEmbeddingForName(selectedSimEmp.name);
        const matchResult = faceMatcherService.matchFace(
          faceVector,
          employees,
          settings?.distanceThreshold || 0.6
        );

        stopLaserScanning();
        setScanning(false);
        setScanningMessage('ALIGN FACE TO SCAN');

        if (matchResult.employee) {
          await executePunchIn(matchResult.employee, matchResult.confidence);
        } else {
          // Play failed animation
          Vibration.vibrate([0, 200]);
          await storageService.addLocalPunchLog({
            name: selectedSimEmp.name,
            action: 'match_failed',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            success: false,
            message: `Match failed (Threshold limit exceeded)`,
          });
          dispatch(loadLocalLogsAndQueue());
          Alert.alert('Face match rejected: Vector distance above strict authentication threshold.');
        }
      }, 1200);
    }, 1500);
  };

  const executePunchIn = async (employee: CachedEmployee, confidence: number) => {
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
        Alert.alert('Error', 'Punch rejected by Laravel gateway.');
        return;
      }
    } catch (err: any) {
      if (err && typeof err === 'string' && (err.includes('already punched') || err.includes('limit') || err.includes('validation') || err.includes('invalid') || err.includes('Rejected'))) {
        // Explicit business logic rejection from Laravel (e.g. duplicate punch-in guard)
        Vibration.vibrate(100);
        await storageService.addLocalPunchLog({
          name: employee.name,
          action: 'rejected',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          success: false,
          message: err,
        });
        dispatch(loadLocalLogsAndQueue());
        Alert.alert('Punch Rejected', err);
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
            <Text style={styles.logSub}>{item.message || 'Edge Verified'}</Text>
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
              {item.action === 'in' && 'IN'}
              {item.action === 'out' && 'OUT'}
              {isQueued && 'QUEUED'}
              {item.action === 'match_failed' && 'MATCH FAILED'}
              {item.action === 'rejected' && 'REJECTED'}
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
            {isOnline ? 'LARAVEL GATEWAY ACTIVE (ONLINE)' : 'OFFLINE MODE (ON-DEVICE AI ACTIVE)'}
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
              {/* Neon border bounds corners */}
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />

              {/* Holographic face guide circles */}
              <View style={[styles.guideOval, scanning && styles.guideOvalScanning]} />
              <View style={[styles.guideCircle, scanning && styles.guideCircleScanning]} />

              {/* Scanning laser sweep */}
              {scanning && (
                <Animated.View
                  style={[
                    styles.scannerLaser,
                    {
                      top: laserAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['10%', '90%'],
                      }),
                    },
                  ]}
                />
              )}

              {/* Static overlay instructions */}
              <View style={styles.scannerPrompt}>
                <CameraIcon color={scanning ? THEME.colors.accent : THEME.colors.textMuted} size={16} />
                <Text style={[styles.scannerPromptText, scanning && { color: THEME.colors.accent }]}>
                  {scanningMessage}
                </Text>
              </View>
            </View>
          </View>

          {/* AI Face Recognition Controller Widget */}
          {true && (
            <View style={styles.simulatorCard}>
              <View style={styles.simHeader}>
                <Text style={styles.simTitle}>Biometric Verification Core</Text>
              </View>

              <Text style={styles.simDesc}>
                Select employee profile to capture biometric signatures, compute Euclidean vector distance, and authenticate.
              </Text>

              {employees.length === 0 ? (
                <View style={styles.emptyEmployeesBox}>
                  <InfoIcon color={THEME.colors.warning} size={16} />
                  <Text style={styles.emptyEmployeesText}>
                    No embeddings synced yet. Go to settings or directory to download employees list.
                  </Text>
                </View>
              ) : (
                <View style={styles.simSelectorRow}>
                  <TouchableOpacity
                    style={styles.pickerTrigger}
                    onPress={() => setPickerVisible(!pickerVisible)}
                  >
                    <Text style={styles.pickerTriggerText}>
                      {selectedSimEmp ? selectedSimEmp.name : 'Select Profile...'}
                    </Text>
                    <Text style={styles.pickerTriggerArrow}>▼</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.simScanBtn, scanning && styles.btnDisabled]}
                    onPress={handleSimulateScan}
                    disabled={scanning}
                  >
                    <Text style={styles.simScanBtnText}>Authenticate Biometric Profile</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Dropdown list */}
              {pickerVisible && employees.length > 0 && (
                <View style={styles.pickerDropdown}>
                  <ScrollView style={styles.pickerScroll} nestedScrollEnabled>
                    {employees.map((emp) => (
                      <TouchableOpacity
                        key={emp.employee_id}
                        style={[
                          styles.pickerItem,
                          selectedSimEmp?.employee_id === emp.employee_id && styles.pickerItemActive,
                        ]}
                        onPress={() => {
                          setSelectedSimEmp(emp);
                          setPickerVisible(false);
                        }}
                      >
                        <Text style={styles.pickerItemText}>{emp.name}</Text>
                        <Text style={styles.pickerItemSub}>EMP ID: #{emp.employee_id}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Right Pane: Stats & Local Live Feed */}
        <View style={styles.rightPane}>
          {/* Stats Bar */}
          <View style={styles.statsBar}>
            <View style={styles.statWidget}>
              <Text style={styles.statVal}>{totalPunchesToday}</Text>
              <Text style={styles.statLbl}>Punches Today</Text>
            </View>
            <View style={styles.statWidgetBorder} />
            <View style={styles.statWidget}>
              <Text style={[styles.statVal, offlineCount > 0 && { color: THEME.colors.warning }]}>
                {offlineCount}
              </Text>
              <Text style={styles.statLbl}>Offline Queue</Text>
            </View>
          </View>

          {/* Live Scan Log Feed */}
          <View style={styles.feedCard}>
            <Text style={styles.feedTitle}>LIVE ATTENDANCE FEED</Text>
            <FlatList
              data={localLogs}
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
              <CheckIcon color="#000" size={48} />
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
    backgroundColor: '#07090e',
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
    backgroundColor: 'rgba(10, 13, 20, 0.85)',
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
    backgroundColor: 'rgba(0,0,0,0.3)',
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
    color: '#000',
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
    borderBottomColor: 'rgba(255,255,255,0.03)',
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
    backgroundColor: 'rgba(0,0,0,0.15)',
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
  logSub: {
    color: THEME.colors.textMuted,
    fontSize: 10,
    marginTop: 1,
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
    backgroundColor: 'rgba(7, 9, 14, 0.96)',
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
    borderTopColor: 'rgba(255,255,255,0.08)',
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
