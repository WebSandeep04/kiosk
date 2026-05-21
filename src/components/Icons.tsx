import React from 'react';
import { View, StyleSheet } from 'react-native';

interface IconProps {
  color: string;
  size: number;
}

export const ServerIcon = ({ color, size }: IconProps) => (
  <View style={[styles.iconContainer, { width: size, height: size }]}>
    <View style={[styles.serverRack, { borderColor: color }]} />
    <View style={[styles.serverRack, { borderColor: color, marginVertical: 3 }]} />
    <View style={[styles.serverRack, { borderColor: color }]} />
    <View style={[styles.dot, { backgroundColor: color, position: 'absolute', right: 4, top: 4 }]} />
    <View style={[styles.dot, { backgroundColor: color, position: 'absolute', right: 4, top: 12 }]} />
    <View style={[styles.dot, { backgroundColor: color, position: 'absolute', right: 4, top: 20 }]} />
  </View>
);

export const KeyIcon = ({ color, size }: IconProps) => (
  <View style={[styles.iconContainer, { width: size, height: size, justifyContent: 'center', alignItems: 'center' }]}>
    <View style={[styles.keyHead, { borderColor: color, borderWidth: 2, width: size * 0.5, height: size * 0.5 }]} />
    <View style={[styles.keyShaft, { backgroundColor: color, width: size * 0.12, height: size * 0.6, position: 'absolute', bottom: 1 }]} />
    <View style={[styles.keyTooth, { backgroundColor: color, width: size * 0.25, height: size * 0.1, position: 'absolute', bottom: 4, right: 3 }]} />
    <View style={[styles.keyTooth, { backgroundColor: color, width: size * 0.25, height: size * 0.1, position: 'absolute', bottom: 9, right: 3 }]} />
  </View>
);

export const CameraIcon = ({ color, size }: IconProps) => (
  <View style={[styles.iconContainer, { width: size, height: size, justifyContent: 'center', alignItems: 'center' }]}>
    <View style={[styles.cameraBody, { borderColor: color, width: size * 0.9, height: size * 0.65 }]} />
    <View style={[styles.cameraLens, { borderColor: color, width: size * 0.4, height: size * 0.4 }]} />
    <View style={[styles.cameraFlash, { backgroundColor: color }]} />
  </View>
);

export const UsersIcon = ({ color, size }: IconProps) => (
  <View style={[styles.iconContainer, { width: size, height: size, flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end' }]}>
    <View style={[styles.avatar, { borderColor: color, marginRight: -2 }]}>
      <View style={[styles.avatarHead, { backgroundColor: color }]} />
      <View style={[styles.avatarBody, { borderColor: color }]} />
    </View>
    <View style={[styles.avatar, { borderColor: color, zIndex: 2 }]}>
      <View style={[styles.avatarHead, { backgroundColor: color }]} />
      <View style={[styles.avatarBody, { borderColor: color }]} />
    </View>
  </View>
);

export const SettingsIcon = ({ color, size }: IconProps) => (
  <View style={[styles.iconContainer, { width: size, height: size, justifyContent: 'center', alignItems: 'center' }]}>
    <View style={[styles.gearCenter, { backgroundColor: color, width: size * 0.3, height: size * 0.3 }]} />
    <View style={[styles.gearProng, { backgroundColor: color, width: size * 0.15, height: size * 0.8, transform: [{ rotate: '0deg' }] }]} />
    <View style={[styles.gearProng, { backgroundColor: color, width: size * 0.15, height: size * 0.8, transform: [{ rotate: '45deg' }] }]} />
    <View style={[styles.gearProng, { backgroundColor: color, width: size * 0.15, height: size * 0.8, transform: [{ rotate: '90deg' }] }]} />
    <View style={[styles.gearProng, { backgroundColor: color, width: size * 0.15, height: size * 0.8, transform: [{ rotate: '135deg' }] }]} />
  </View>
);

export const WifiIcon = ({ color, size, active }: IconProps & { active: boolean }) => (
  <View style={[styles.iconContainer, { width: size, height: size, justifyContent: 'flex-end', alignItems: 'center' }]}>
    <View style={[styles.wifiArc, { borderColor: active ? color : '#ef4444', width: size, height: size, borderTopWidth: 2 }]} />
    <View style={[styles.wifiArc, { borderColor: active ? color : '#ef4444', width: size * 0.7, height: size * 0.7, borderTopWidth: 2, position: 'absolute', bottom: 3 }]} />
    <View style={[styles.wifiArc, { borderColor: active ? color : '#ef4444', width: size * 0.4, height: size * 0.4, borderTopWidth: 2, position: 'absolute', bottom: 6 }]} />
    <View style={[styles.wifiDot, { backgroundColor: active ? color : '#ef4444' }]} />
  </View>
);

export const SyncIcon = ({ color, size }: IconProps) => (
  <View style={[styles.iconContainer, { width: size, height: size, justifyContent: 'center', alignItems: 'center' }]}>
    <View style={[styles.syncRing, { borderColor: color, borderTopColor: 'transparent', borderBottomColor: 'transparent' }]} />
    <View style={[styles.syncArrow, { borderTopColor: color, position: 'absolute', top: 2, right: 2, transform: [{ rotate: '-45deg' }] }]} />
    <View style={[styles.syncArrow, { borderTopColor: color, position: 'absolute', bottom: 2, left: 2, transform: [{ rotate: '135deg' }] }]} />
  </View>
);

export const InfoIcon = ({ color, size }: IconProps) => (
  <View style={[styles.iconContainer, { width: size, height: size, borderColor: color, borderWidth: 2, borderRadius: size / 2, justifyContent: 'center', alignItems: 'center' }]}>
    <View style={{ width: 2, height: 6, backgroundColor: color, marginTop: 2 }} />
    <View style={{ width: 2, height: 2, backgroundColor: color, position: 'absolute', top: 3 }} />
  </View>
);

export const CheckIcon = ({ color, size }: IconProps) => (
  <View style={[styles.iconContainer, { width: size, height: size, justifyContent: 'center', alignItems: 'center' }]}>
    <View style={[styles.checkStem, { backgroundColor: color, transform: [{ rotate: '-45deg' }], left: -2, top: 2 }]} />
    <View style={[styles.checkKick, { backgroundColor: color, transform: [{ rotate: '45deg' }], left: 3, top: -1 }]} />
  </View>
);

export const CrossIcon = ({ color, size }: IconProps) => (
  <View style={[styles.iconContainer, { width: size, height: size, justifyContent: 'center', alignItems: 'center' }]}>
    <View style={[styles.crossBar, { backgroundColor: color, transform: [{ rotate: '45deg' }] }]} />
    <View style={[styles.crossBar, { backgroundColor: color, transform: [{ rotate: '-45deg' }] }]} />
  </View>
);

export const PlusIcon = ({ color, size }: IconProps) => (
  <View style={[styles.iconContainer, { width: size, height: size, justifyContent: 'center', alignItems: 'center' }]}>
    <View style={[styles.crossBar, { backgroundColor: color }]} />
    <View style={[styles.crossBar, { backgroundColor: color, transform: [{ rotate: '90deg' }] }]} />
  </View>
);

const styles = StyleSheet.create({
  iconContainer: {
    position: 'relative',
  },
  // Server
  serverRack: {
    width: '100%',
    height: 6,
    borderWidth: 1.5,
    borderRadius: 2,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
  // Key
  keyHead: {
    borderRadius: 99,
  },
  keyShaft: {
    borderRadius: 1,
  },
  keyTooth: {
    height: 2,
    borderRadius: 1,
  },
  // Camera
  cameraBody: {
    borderWidth: 2,
    borderRadius: 4,
  },
  cameraLens: {
    borderWidth: 2,
    borderRadius: 99,
    position: 'absolute',
  },
  cameraFlash: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    position: 'absolute',
    top: 4,
    right: 4,
  },
  // Users
  avatar: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
  },
  avatarHead: {
    width: 6,
    height: 6,
    borderRadius: 3,
    position: 'absolute',
    top: 1,
  },
  avatarBody: {
    width: 12,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    bottom: -3,
    position: 'absolute',
  },
  // Settings
  gearCenter: {
    borderRadius: 99,
    zIndex: 10,
  },
  gearProng: {
    position: 'absolute',
    borderRadius: 2,
  },
  // Wifi
  wifiArc: {
    borderRadius: 99,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  wifiDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    position: 'absolute',
    bottom: 0,
  },
  // Sync
  syncRing: {
    width: '80%',
    height: '80%',
    borderWidth: 2,
    borderRadius: 99,
  },
  syncArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 3,
    borderRightWidth: 3,
    borderTopWidth: 5,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  // Check
  checkStem: {
    width: 3,
    height: 10,
    borderRadius: 1.5,
    position: 'absolute',
  },
  checkKick: {
    width: 3,
    height: 16,
    borderRadius: 1.5,
    position: 'absolute',
  },
  // Cross
  crossBar: {
    width: 3,
    height: 20,
    borderRadius: 1.5,
    position: 'absolute',
  }
});
