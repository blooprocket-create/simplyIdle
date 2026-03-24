import React from 'react';
import { View, Text, Pressable, StyleSheet, Modal } from 'react-native';
import { REBIRTH_WAVE_THRESHOLD, REBIRTH_BONUS } from '../gameConfig.ts';

interface Props {
  visible: boolean;
  wave: number;
  prestigeCount: number; // rebirth count
  onConfirm: () => void;
  onCancel: () => void;
}

export default function RebirthModal({ visible, wave, prestigeCount, onConfirm, onCancel }: Props) {
  const canRebirth = wave >= REBIRTH_WAVE_THRESHOLD;
  const nextBonus = Math.pow(REBIRTH_BONUS, prestigeCount + 1).toFixed(2);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.box}>
          <Text style={styles.title}>♾️ REBIRTH</Text>
          <Text style={styles.sub}>Reset your journey for an eternal power bonus.</Text>

          <View style={styles.stat}>
            <Text style={styles.statLabel}>Current Wave</Text>
            <Text style={styles.statVal}>{wave}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Required</Text>
            <Text style={styles.statVal}>Wave {REBIRTH_WAVE_THRESHOLD}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>New Power Bonus</Text>
            <Text style={[styles.statVal, styles.golden]}>{nextBonus}×</Text>
          </View>

          {!canRebirth && (
            <Text style={styles.warning}>
              Reach wave {REBIRTH_WAVE_THRESHOLD} first!  ({REBIRTH_WAVE_THRESHOLD - wave} to go)
            </Text>
          )}

          <View style={styles.buttons}>
            <Pressable style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>Not Yet</Text>
            </Pressable>
            <Pressable
              style={[styles.confirmBtn, !canRebirth && styles.disabledBtn]}
              onPress={canRebirth ? onConfirm : undefined}
              disabled={!canRebirth}
            >
              <Text style={styles.confirmText}>Ascend ✨</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  box: {
    backgroundColor: '#0D0B1E',
    borderRadius: 20,
    padding: 28,
    width: 320,
    borderWidth: 2,
    borderColor: '#C77DFF',
  },
  title: {
    color: '#C77DFF',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 3,
  },
  sub: {
    color: '#8888BB',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 20,
  },
  stat: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  statLabel: {
    color: '#AAAACC',
    fontSize: 14,
  },
  statVal: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  golden: {
    color: '#FFD700',
  },
  warning: {
    color: '#FF6B6B',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#2D2D5B',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelText: {
    color: '#AAAACC',
    fontWeight: '700',
  },
  confirmBtn: {
    flex: 1,
    backgroundColor: '#7B2FBE',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  disabledBtn: {
    backgroundColor: '#3A3A5C',
  },
  confirmText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
});
