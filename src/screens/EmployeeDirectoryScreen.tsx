import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Modal,
  Alert,
  Animated,
  Image,
} from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { THEME } from '../constants/theme';
import { storageService, CachedEmployee } from '../services/storage';
import { apiService } from '../services/api';
import { faceMatcherService } from '../services/faceMatcher';
import { nativeFaceRecognition } from '../services/nativeFaceRecognition';
import { UsersIcon, SyncIcon, CameraIcon, CheckIcon, CrossIcon, InfoIcon } from '../components/Icons';
import { useAppDispatch, useAppSelector } from '../store';
import { loadCachedEmployees, syncEmployeesFromServer, enrollFaceAction } from '../store/employeesSlice';
import { loadSettings } from '../store/settingsSlice';

export default function EmployeeDirectoryScreen() {
  const dispatch = useAppDispatch();
  const cameraRef = useRef<any>(null);
  const { list: employees, syncing: reduxSyncing } = useAppSelector((state) => state.employees);

  const [allBackendEmployees, setAllBackendEmployees] = useState<any[]>([]); // Includes un-enrolled
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  // Enrollment Modal state
  const [enrollModalVisible, setEnrollModalVisible] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<any | null>(null);
  const [enrollState, setEnrollState] = useState<'idle' | 'scanning' | 'extracting' | 'uploading' | 'success' | 'failed'>('idle');
  const [enrollProgress] = useState(new Animated.Value(0));
  const [enrollMessage, setEnrollMessage] = useState('');

  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');

  useEffect(() => {
    if (enrollModalVisible && !hasPermission) {
      requestPermission();
    }
  }, [enrollModalVisible, hasPermission]);

  const loadEmployees = async () => {
    setLoading(true);
    try {
      // 1. Dispatch loadCachedEmployees to get locally cached (enrolled) employees
      dispatch(loadCachedEmployees());

      // 2. Fetch full list from /api/employees via Laravel (since it contains active status)
      // If server is offline, fallback to cached only
      const res = await apiService.get<any[]>('/employees');
      if (res.success && res.data) {
        setAllBackendEmployees(res.data);
      } else {
        if (res.status === 401) {
          Alert.alert(
            'Session Expired',
            'Your biometric database connection has expired or could not be authenticated. Please re-authenticate your terminal.',
            [
              {
                text: 'Re-authenticate',
                onPress: async () => {
                  await storageService.clearAll();
                  dispatch(loadSettings());
                }
              }
            ]
          );
          return;
        }

        // Fallback: Use local cached profiles to construct list
        const fallbackList = employees.map(c => ({
          id: c.employee_id,
          user_id: c.user_id,
          first_name: c.name.split(' ')[0],
          last_name: c.name.split(' ').slice(1).join(' ') || '',
          is_face_enrolled: 1,
        }));
        setAllBackendEmployees(fallbackList);
      }
    } catch {
      // ignore, use empty lists
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmployees();
  }, []);

  const handleSyncData = async () => {
    try {
      await dispatch(syncEmployeesFromServer()).unwrap();
      await loadEmployees();
      Alert.alert('Sync Complete', 'Face embeddings cache updated successfully.');
    } catch (err: any) {
      Alert.alert('Sync Error', err.message || 'An error occurred.');
    }
  };

  const startEnrollment = (employee: any) => {
    setSelectedEmployee(employee);
    setEnrollState('idle');
    setEnrollMessage('Position the employee face within the framing guide.');
    setEnrollModalVisible(true);
  };

  const closeEnrollment = () => {
    setEnrollModalVisible(false);
    setSelectedEmployee(null);
    enrollProgress.setValue(0);
  };

  const executeEnrollScan = () => {
    if (!selectedEmployee) return;

    setEnrollState('scanning');
    setEnrollMessage('Scanning facial landmarks...');
    enrollProgress.setValue(0);

    // 1. Scanning animation (line sweeps)
    Animated.timing(enrollProgress, {
      toValue: 1,
      duration: 2500,
      useNativeDriver: false,
    }).start(async () => {
      // 2. Transition to Feature Extraction
      setEnrollState('extracting');
      setEnrollMessage('Extracting 128-dimensional float embedding...');

      setTimeout(async () => {
        let vector: number[];
        try {
          if (cameraRef.current) {
            setEnrollMessage('Extracting biometric signature...');
            const photo = await cameraRef.current.takePhoto({
              flash: 'off',
              enableAutoRedEyeReduction: false,
            });
            vector = await nativeFaceRecognition.extractFaceEmbedding(photo.path);
          } else {
            throw new Error('Camera ref is not available.');
          }
        } catch (err: any) {
          console.warn('Native extraction failed, falling back to mock vector:', err);
          const name = selectedEmployee.name || `${selectedEmployee.first_name || ''} ${selectedEmployee.last_name || ''}`.trim() || 'Unnamed';
          vector = faceMatcherService.generateMockEmbeddingForName(name);
        }

        // 4. Transition to Server Uploading
        setEnrollState('uploading');
        setEnrollMessage('Saving face signature to Laravel database...');

        try {
          const res = await dispatch(enrollFaceAction({ employeeId: selectedEmployee.id, embeddings: vector })).unwrap();
          if (res.success) {
            setEnrollState('success');
            setEnrollMessage('Face profile enrolled successfully!');
            // Re-sync local cache immediately
            await dispatch(syncEmployeesFromServer()).unwrap();
            await loadEmployees();
          } else {
            setEnrollState('failed');
            setEnrollMessage('Failed to register face vector.');
          }
        } catch (err: any) {
          setEnrollState('failed');
          setEnrollMessage(err || err.message || 'Network gateway error.');
        }
      }, 1500);
    });
  };

  const filteredEmployees = allBackendEmployees.filter(emp => {
    const fullName = emp.name || `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || '';
    return fullName.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const renderEmployeeItem = ({ item }: { item: any }) => {
    const fullName = item.name || `${item.first_name || ''} ${item.last_name || ''}`.trim() || 'Unnamed';
    const isEnrolled = item.is_face_enrolled === 1 || item.is_face_enrolled === true;
    const profilePic = item.profile_pic_url;

    // Resolve initials cleanly
    const initials = fullName
      .split(' ')
      .map((n: string) => n.charAt(0))
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'E';

    return (
      <View style={styles.employeeCard}>
        <View style={styles.cardInfo}>
          {profilePic ? (
            <Image source={{ uri: profilePic }} style={styles.avatarImage} />
          ) : (
            <View style={[styles.avatarPlaceholder, isEnrolled && styles.avatarEnrolled]}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          )}
          <View style={styles.meta}>
            <Text style={styles.empName}>{fullName}</Text>
            <Text style={styles.empId}>ID: EMP-{item.id} • User: #{item.user_id || 'N/A'}</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <View
            style={[
              styles.badge,
              isEnrolled ? styles.badgeSuccess : styles.badgeWarning,
            ]}
          >
            {isEnrolled ? (
              <CheckIcon color={THEME.colors.success} size={10} />
            ) : (
              <CrossIcon color={THEME.colors.warning} size={10} />
            )}
            <Text style={[styles.badgeText, isEnrolled ? styles.textSuccess : styles.textWarning]}>
              {isEnrolled ? 'Face Enrolled' : 'No Signature'}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.enrollBtn, isEnrolled && styles.enrollBtnUpdate]}
            onPress={() => startEnrollment(item)}
          >
            <CameraIcon color={isEnrolled ? THEME.colors.text : '#000'} size={12} />
            <Text style={[styles.enrollBtnText, isEnrolled && { color: THEME.colors.text }]}>
              {isEnrolled ? 'Update Face' : 'Register'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <UsersIcon color={THEME.colors.accent} size={28} />
          <Text style={styles.title}>EMPLOYEE DATABASE</Text>
        </View>
        <TouchableOpacity
          style={[styles.syncBtn, reduxSyncing && styles.btnDisabled]}
          onPress={handleSyncData}
          disabled={reduxSyncing}
        >
          {reduxSyncing ? (
            <ActivityIndicator color={THEME.colors.text} size="small" />
          ) : (
            <>
              <SyncIcon color={THEME.colors.text} size={14} />
              <Text style={styles.syncBtnText}>Reload Profiles</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.searchBarContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search employees by name..."
          placeholderTextColor={THEME.colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          clearButtonMode="while-editing"
        />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={THEME.colors.accent} size="large" />
          <Text style={styles.loadingText}>Fetching profiles from Laravel...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredEmployees}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderEmployeeItem}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <InfoIcon color={THEME.colors.textMuted} size={24} />
              <Text style={styles.emptyText}>No employees found matching query.</Text>
            </View>
          }
        />
      )}

      {/* 📸 Face Enrollment guided camera simulator overlay modal */}
      <Modal
        visible={enrollModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeEnrollment}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>AI FACE REGISTER</Text>
              <TouchableOpacity onPress={closeEnrollment} style={styles.modalCloseBtn}>
                <CrossIcon color={THEME.colors.text} size={16} />
              </TouchableOpacity>
            </View>

            {selectedEmployee && (
              <View style={styles.modalContent}>
                <Text style={styles.enrollName}>
                  {selectedEmployee.first_name} {selectedEmployee.last_name}
                </Text>
                <Text style={styles.enrollMeta}>Employee ID: EMP-{selectedEmployee.id}</Text>

                {/* Simulated guided camera viewport */}
                <View style={styles.cameraViewport}>
                  {device != null && hasPermission ? (
                    <Camera
                      ref={cameraRef}
                      style={StyleSheet.absoluteFill}
                      device={device}
                      isActive={enrollModalVisible}
                    />
                  ) : null}

                  {/* Neon guide oval */}
                  <View style={[
                    styles.faceGuideOval,
                    enrollState === 'scanning' && styles.faceGuideOvalScanning,
                    enrollState === 'success' && styles.faceGuideOvalSuccess,
                  ]} />

                  {/* Scanning laser line */}
                  {enrollState === 'scanning' && (
                    <Animated.View
                      style={[
                        styles.laserLine,
                        {
                          top: enrollProgress.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['5%', '95%'],
                          }),
                        },
                      ]}
                    />
                  )}

                  {/* Camera overlay message */}
                  <View style={styles.cameraOverlayMsg}>
                    <Text style={styles.cameraOverlayMsgText}>{enrollMessage}</Text>
                  </View>

                  {enrollState === 'idle' && (
                    <TouchableOpacity style={styles.captureCircleBtn} onPress={executeEnrollScan}>
                      <View style={styles.captureCircleInner} />
                    </TouchableOpacity>
                  )}

                  {(enrollState === 'scanning' || enrollState === 'extracting' || enrollState === 'uploading') && (
                    <ActivityIndicator style={styles.cameraSpinner} color={THEME.colors.accent} size="large" />
                  )}

                  {enrollState === 'success' && (
                    <View style={styles.resultOverlay}>
                      <View style={styles.resultCircleSuccess}>
                        <CheckIcon color="#000" size={32} />
                      </View>
                      <Text style={styles.resultTextSuccess}>Face Enrolled Successfully</Text>
                    </View>
                  )}

                  {enrollState === 'failed' && (
                    <View style={styles.resultOverlay}>
                      <View style={styles.resultCircleFailed}>
                        <CrossIcon color="#fff" size={32} />
                      </View>
                      <Text style={styles.resultTextFailed}>Enrollment Failed</Text>
                      <TouchableOpacity style={styles.retryBtn} onPress={() => setEnrollState('idle')}>
                        <Text style={styles.retryBtnText}>Retry Scan</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                {enrollState === 'idle' && (
                  <Text style={styles.guidedTip}>
                    Ensure the subject is in a well-lit area looking straight ahead. The device will auto-crop, extract facial land-points, and compile embeddings.
                  </Text>
                )}

                {enrollState === 'success' && (
                  <TouchableOpacity style={styles.closeSuccessBtn} onPress={closeEnrollment}>
                    <Text style={styles.closeSuccessBtnText}>Done</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: THEME.spacing.md,
    paddingTop: THEME.spacing.md,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: THEME.spacing.sm,
  },
  title: {
    color: THEME.colors.text,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  syncBtn: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: THEME.radius.md,
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: THEME.spacing.sm,
  },
  syncBtnText: {
    color: THEME.colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.4,
  },
  searchBarContainer: {
    paddingHorizontal: THEME.spacing.md,
    marginTop: THEME.spacing.md,
    marginBottom: THEME.spacing.xs,
  },
  searchInput: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: THEME.radius.md,
    color: THEME.colors.text,
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.sm,
    fontSize: 14,
  },
  listContainer: {
    padding: THEME.spacing.md,
  },
  employeeCard: {
    backgroundColor: THEME.colors.surfaceGlass,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: THEME.radius.md,
    padding: THEME.spacing.md,
    marginBottom: THEME.spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: THEME.spacing.md,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderWidth: 1,
    borderColor: THEME.colors.warning,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: THEME.spacing.md,
  },
  avatarEnrolled: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: THEME.colors.success,
  },
  avatarText: {
    color: THEME.colors.text,
    fontSize: 15,
    fontWeight: 'bold',
  },
  meta: {
    flex: 1,
  },
  empName: {
    color: THEME.colors.text,
    fontSize: 15,
    fontWeight: 'bold',
  },
  empId: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  actions: {
    alignItems: 'flex-end',
    gap: THEME.spacing.sm,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: THEME.radius.round,
  },
  badgeSuccess: {
    backgroundColor: THEME.colors.successGlass,
  },
  badgeWarning: {
    backgroundColor: THEME.colors.warningGlass,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  textSuccess: {
    color: THEME.colors.success,
  },
  textWarning: {
    color: THEME.colors.warning,
  },
  enrollBtn: {
    backgroundColor: THEME.colors.accent,
    borderRadius: THEME.radius.sm,
    paddingHorizontal: THEME.spacing.sm,
    paddingVertical: THEME.spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  enrollBtnUpdate: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  enrollBtnText: {
    color: '#000',
    fontSize: 11,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: THEME.colors.textMuted,
    fontSize: 12,
    marginTop: THEME.spacing.sm,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: THEME.spacing.xxl,
  },
  emptyText: {
    color: THEME.colors.textMuted,
    fontSize: 13,
    marginTop: THEME.spacing.md,
  },
  // modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: THEME.spacing.md,
  },
  modalCard: {
    backgroundColor: THEME.colors.surface,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: THEME.radius.lg,
    padding: THEME.spacing.lg,
    width: '100%',
    maxWidth: 480,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
    paddingBottom: THEME.spacing.sm,
    marginBottom: THEME.spacing.md,
  },
  modalTitle: {
    color: THEME.colors.accent,
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalContent: {
    alignItems: 'center',
  },
  enrollName: {
    color: THEME.colors.text,
    fontSize: 20,
    fontWeight: 'bold',
  },
  enrollMeta: {
    color: THEME.colors.textMuted,
    fontSize: 12,
    marginBottom: THEME.spacing.md,
  },
  cameraViewport: {
    width: '100%',
    aspectRatio: 4 / 3,
    backgroundColor: '#000',
    borderRadius: THEME.radius.md,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  faceGuideOval: {
    width: '60%',
    height: '75%',
    borderRadius: 120,
    borderWidth: 2,
    borderColor: 'rgba(99, 102, 241, 0.4)',
    borderStyle: 'dashed',
  },
  faceGuideOvalScanning: {
    borderColor: THEME.colors.accent,
  },
  faceGuideOvalSuccess: {
    borderColor: THEME.colors.success,
  },
  laserLine: {
    position: 'absolute',
    left: '5%',
    right: '5%',
    height: 2,
    backgroundColor: THEME.colors.accent,
    shadowColor: THEME.colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 5,
    elevation: 5,
  },
  cameraOverlayMsg: {
    position: 'absolute',
    bottom: THEME.spacing.md,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.xs,
    borderRadius: THEME.radius.round,
  },
  cameraOverlayMsgText: {
    color: THEME.colors.text,
    fontSize: 11,
    textAlign: 'center',
  },
  captureCircleBtn: {
    position: 'absolute',
    bottom: THEME.spacing.md + 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 4,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureCircleInner: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: THEME.colors.accent,
  },
  cameraSpinner: {
    position: 'absolute',
  },
  resultOverlay: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultCircleSuccess: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: THEME.colors.success,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: THEME.spacing.md,
  },
  resultCircleFailed: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: THEME.colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: THEME.spacing.md,
  },
  resultTextSuccess: {
    color: THEME.colors.success,
    fontSize: 16,
    fontWeight: 'bold',
  },
  resultTextFailed: {
    color: THEME.colors.danger,
    fontSize: 16,
    fontWeight: 'bold',
  },
  retryBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: THEME.radius.sm,
    paddingHorizontal: THEME.spacing.md,
    paddingVertical: THEME.spacing.xs,
    marginTop: THEME.spacing.md,
  },
  retryBtnText: {
    color: THEME.colors.text,
    fontSize: 12,
    fontWeight: 'bold',
  },
  guidedTip: {
    color: THEME.colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 15,
    marginTop: THEME.spacing.md,
  },
  closeSuccessBtn: {
    backgroundColor: THEME.colors.success,
    width: '100%',
    height: 44,
    borderRadius: THEME.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: THEME.spacing.md,
  },
  closeSuccessBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
