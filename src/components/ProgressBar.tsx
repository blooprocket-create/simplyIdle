import React from 'react';
import { View, ViewStyle, StyleSheet } from 'react-native';
import { theme } from '../theme/colors';

interface ProgressBarProps {
  percent: number;
  color?: string;
  height?: number;
  backgroundColor?: string;
  borderRadius?: number;
  style?: ViewStyle;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  percent,
  color = theme.status.positive,
  height = 18,
  backgroundColor = '#2A2A4A',
  borderRadius = 4,
  style,
}) => {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <View
      style={[styles.bg, { height, backgroundColor, borderRadius }, style]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: clamped }}
    >
      <View
        style={[
          styles.fill,
          { width: `${clamped}%`, backgroundColor: color, borderRadius },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
});
