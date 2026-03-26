import React from 'react';
import { ScrollView, StyleSheet, ViewStyle } from 'react-native';
import { theme } from '../theme/colors';

interface MobileScrollContainerProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export default function MobileScrollContainer({ children, style }: MobileScrollContainerProps) {
  return (
    <ScrollView
      style={[styles.container, style]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      scrollIndicatorInsets={{ right: 1 }}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg.darkest,
  },
  content: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
  },
});
