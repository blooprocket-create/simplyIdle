import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SkillConfig } from '../gameConfig.ts';
import { fmt } from '../utils';
import { FeedbackPressable as Pressable } from './FeedbackPressable';

interface Props {
  config: SkillConfig;
  canAfford: boolean;
  onBuy: () => void;
}

export default function SkillCard({ config, canAfford, onBuy }: Props) {
  return (
    <Pressable
      style={[styles.card, !canAfford && styles.locked]}
      onPress={onBuy}
      disabled={!canAfford}
      android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
    >
      <View style={styles.info}>
        <Text style={styles.name}>{config.name}</Text>
        <Text style={styles.desc}>{config.description}</Text>
      </View>
      <Text style={styles.cost}>💰 {fmt(config.cost)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#0E1020',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#FFD70044',
  },
  locked: { opacity: 0.4 },
  info: { flex: 1 },
  name: {
    color: '#FFD700',
    fontWeight: '700',
    fontSize: 14,
  },
  desc: {
    color: '#AAAACC',
    fontSize: 12,
    marginTop: 2,
  },
  cost: {
    color: '#FFD700',
    fontWeight: '700',
    fontSize: 13,
    marginLeft: 12,
  },
});
