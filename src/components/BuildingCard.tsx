import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { PartyConfig } from '../gameConfig';
import { fmt } from '../utils';

interface Props {
  config: PartyConfig;
  owned: number;
  cost: number;
  canAfford: boolean;
  onBuy: (amount: 1 | 10 | 100) => void;
}

export default function PartyCard({ config, owned, cost, canAfford, onBuy }: Props) {
  return (
    <View style={[styles.card, !canAfford && styles.locked]}>
      <View style={styles.left}>
        <Text style={styles.emoji}>{config.emoji}</Text>
        <View style={styles.info}>
          <Text style={styles.name}>{config.name}</Text>
          <Text style={styles.desc}>{config.description}</Text>
          <Text style={styles.dps}>⚔️ {fmt(config.baseDps)} DPS each</Text>
        </View>
      </View>

      <View style={styles.right}>
        <Text style={styles.owned}>{owned}</Text>
        <Text style={styles.costLabel}>💰 {fmt(cost)}</Text>
        <View style={styles.buyRow}>
          {([1, 10, 100] as const).map(amt => (
            <Pressable
              key={amt}
              style={[styles.buyBtn, !canAfford && styles.buyBtnDisabled]}
              onPress={() => onBuy(amt)}
              disabled={!canAfford}
              android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
            >
              <Text style={styles.buyBtnText}>×{amt}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#12122A',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#2A2A55',
  },
  locked: { opacity: 0.5 },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  emoji: { fontSize: 32 },
  info: { flex: 1 },
  name: {
    color: '#E8E8FF',
    fontWeight: '700',
    fontSize: 14,
  },
  desc: {
    color: '#7777AA',
    fontSize: 11,
    marginTop: 1,
  },
  dps: {
    color: '#FF8844',
    fontSize: 11,
    marginTop: 2,
    fontWeight: '600',
  },
  right: {
    alignItems: 'flex-end',
    minWidth: 95,
  },
  owned: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 28,
  },
  costLabel: {
    color: '#FFD700',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 5,
  },
  buyRow: {
    flexDirection: 'row',
    gap: 3,
  },
  buyBtn: {
    backgroundColor: '#8B1A1A',
    borderRadius: 7,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  buyBtnDisabled: { backgroundColor: '#333355' },
  buyBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
});
