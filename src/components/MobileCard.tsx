import React from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { theme } from '../theme/colors';

interface CardSection {
  title?: string;
  items: Array<{
    label: string;
    value: string | React.ReactNode;
    highlight?: boolean;
    color?: string;
  }>;
}

interface MobileCardProps {
  title?: string;
  icon?: string;
  sections: CardSection[];
  action?: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
    variant?: 'primary' | 'secondary' | 'danger';
  };
  actions?: Array<{
    label: string;
    onPress: () => void;
    disabled?: boolean;
    variant?: 'primary' | 'secondary' | 'danger';
  }>;
  footer?: string;
  style?: ViewStyle;
}

export default function MobileCard({ title, icon, sections, action, actions, footer, style }: MobileCardProps) {
  const allActions = actions || (action ? [action] : []);

  return (
    <View style={[styles.card, style]}>
      {(title || icon) && (
        <View style={styles.header}>
          {icon && <Text style={styles.icon}>{icon}</Text>}
          {title && <Text style={styles.title}>{title}</Text>}
        </View>
      )}

      {sections.map((section, idx) => (
        <View key={idx} style={styles.section}>
          {section.title && <Text style={styles.sectionTitle}>{section.title}</Text>}
          {section.items.map((item, itemIdx) => (
            <View key={itemIdx} style={styles.row}>
              <Text style={[styles.label, item.highlight && styles.labelHighlight]}>{item.label}</Text>
              <Text
                style={[styles.value, item.highlight && styles.valueHighlight, item.color && { color: item.color }]}
              >
                {typeof item.value === 'string' ? item.value : item.value}
              </Text>
            </View>
          ))}
        </View>
      ))}

      {allActions.length > 0 && (
        <View style={[styles.actions, allActions.length === 1 && styles.actionsOneBtn]}>
          {allActions.map((actionItem, idx) => (
            <Pressable
              key={idx}
              style={({ pressed }) => [
                styles.actionBtn,
                getActionStyle(actionItem.variant),
                actionItem.disabled && styles.actionBtnDisabled,
                pressed && !actionItem.disabled && styles.actionBtnPressed,
              ]}
              onPress={actionItem.onPress}
              disabled={actionItem.disabled}
            >
              <Text style={[styles.actionText, getActionTextStyle(actionItem.variant)]}>{actionItem.label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {footer && <Text style={styles.footer}>{footer}</Text>}
    </View>
  );
}

function getActionStyle(variant?: string) {
  switch (variant) {
    case 'secondary':
      return styles.actionBtnSecondary;
    case 'danger':
      return styles.actionBtnDanger;
    default:
      return styles.actionBtnPrimary;
  }
}

function getActionTextStyle(variant?: string) {
  switch (variant) {
    case 'secondary':
      return styles.actionTextSecondary;
    case 'danger':
      return styles.actionTextDanger;
    default:
      return styles.actionTextPrimary;
  }
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.bg.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border.light,
    marginBottom: theme.spacing.md,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border.subtle,
    gap: theme.spacing.md,
  },
  icon: {
    fontSize: 20,
  },
  title: {
    flex: 1,
    color: theme.text.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  section: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border.subtle,
  },
  sectionTitle: {
    color: theme.text.secondary,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: theme.spacing.sm,
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  label: {
    flex: 1,
    color: theme.text.secondary,
    fontSize: 13,
  },
  labelHighlight: {
    color: theme.text.primary,
    fontWeight: '600',
  },
  value: {
    color: theme.text.primary,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
  },
  valueHighlight: {
    color: theme.accent.primary,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.border.subtle,
  },
  actionsOneBtn: {
    paddingHorizontal: theme.spacing.md,
  },
  actionBtn: {
    flex: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnPrimary: {
    backgroundColor: theme.accent.primary,
  },
  actionBtnSecondary: {
    backgroundColor: theme.bg.darker,
    borderWidth: 1,
    borderColor: theme.border.medium,
  },
  actionBtnDanger: {
    backgroundColor: 'rgba(255, 91, 138, 0.1)',
    borderWidth: 1,
    borderColor: theme.status.danger,
  },
  actionBtnDisabled: {
    opacity: 0.4,
  },
  actionBtnPressed: {
    opacity: 0.8,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  actionTextPrimary: {
    color: theme.bg.deepestBlack,
  },
  actionTextSecondary: {
    color: theme.text.primary,
  },
  actionTextDanger: {
    color: theme.status.danger,
  },
  footer: {
    color: theme.text.tertiary,
    fontSize: 11,
    fontStyle: 'italic',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    textAlign: 'center',
  },
});
