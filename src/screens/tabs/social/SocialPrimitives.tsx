import React from 'react';
import { Pressable, Text, TextInput, TextInputProps, View } from 'react-native';
import { THEME } from '../../../theme';

interface SocialCardProps {
  styles: any;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
}

export function SocialCard({ styles, title, subtitle, children }: SocialCardProps) {
  return (
    <View style={styles.card}>
      {title ? <Text style={styles.cardTitle}>{title}</Text> : null}
      {subtitle ? <Text style={styles.metaText}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

interface SocialInputProps extends TextInputProps {
  styles: any;
}

export function SocialInput({ styles, ...props }: SocialInputProps) {
  return (
    <TextInput
      {...props}
      style={[styles.input, props.style]}
      placeholderTextColor={props.placeholderTextColor ?? THEME.text.tertiary}
    />
  );
}

interface SocialPrimaryButtonProps {
  styles: any;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

export function SocialPrimaryButton({ styles, label, onPress, disabled }: SocialPrimaryButtonProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.sendBtn,
        disabled && styles.sendBtnDisabled,
        pressed && !disabled && styles.sendBtnPressed,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.sendBtnText}>{label}</Text>
    </Pressable>
  );
}

interface SocialProgressBarProps {
  styles: any;
  progress: number;
  label?: string;
  tint?: string;
}

export function SocialProgressBar({ styles, progress, label, tint }: SocialProgressBarProps) {
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <View style={styles.progressBlock}>
      {!!label && <Text style={styles.progressLabel}>{label}</Text>}
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${Math.round(clamped * 100)}%` },
            tint ? { backgroundColor: tint } : null,
          ]}
        />
      </View>
    </View>
  );
}

interface SocialAsyncStateProps {
  styles: any;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptySubtitle?: string;
  error?: string | null;
  onRetry?: () => void;
  variant?: 'card' | 'inline';
}

export function SocialAsyncState({
  styles,
  isLoading,
  isEmpty,
  emptyTitle,
  emptySubtitle,
  error,
  onRetry,
  variant = 'card',
}: SocialAsyncStateProps) {
  if (!isLoading && !isEmpty && !error) return null;

  const title = error ? 'Sync Issue' : isLoading ? 'Syncing...' : (emptyTitle ?? 'Nothing Here Yet');

  const subtitle = error
    ? `⚠️ ${error}`
    : isLoading
      ? 'Pulling latest social data.'
      : (emptySubtitle ?? 'Try checking back shortly.');

  if (variant === 'inline') {
    return (
      <View style={styles.asyncInlineContainer}>
        <Text style={styles.asyncInlineTitle}>{title}</Text>
        <Text style={error ? styles.errorText : styles.metaText}>{subtitle}</Text>
        {!!isLoading && (
          <View style={styles.skeletonStack}>
            <View style={[styles.skeletonBlock, styles.skeletonBlockShort]} />
            <View style={[styles.skeletonBlock, styles.skeletonBlockMedium]} />
          </View>
        )}
        {!!error && !!onRetry && (
          <Pressable style={styles.smallBtn} onPress={onRetry}>
            <Text style={styles.smallBtnText}>Retry</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <SocialCard styles={styles} title={title}>
      <Text style={error ? styles.errorText : styles.metaText}>{subtitle}</Text>
      {!!isLoading && (
        <View style={styles.skeletonStack}>
          <View style={styles.skeletonBlock} />
          <View style={[styles.skeletonBlock, styles.skeletonBlockMedium]} />
          <View style={[styles.skeletonBlock, styles.skeletonBlockShort]} />
        </View>
      )}
      {!!error && !!onRetry && (
        <Pressable style={styles.smallBtn} onPress={onRetry}>
          <Text style={styles.smallBtnText}>Retry</Text>
        </Pressable>
      )}
    </SocialCard>
  );
}
