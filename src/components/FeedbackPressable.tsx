import React, { forwardRef, useCallback } from 'react';
import {
  Platform,
  Pressable as RNPressable,
  PressableProps,
  PressableStateCallbackType,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

interface FeedbackPressableProps extends PressableProps {
  disableDefaultFeedback?: boolean;
  pressedOpacity?: number;
  pressedScale?: number;
}

const DEFAULT_PRESSED_OPACITY = 0.78;
const DEFAULT_PRESSED_SCALE = 0.985;
const DEFAULT_ANDROID_RIPPLE = { color: 'rgba(255,255,255,0.12)', borderless: false };

function isStyleCallback(
  style: FeedbackPressableProps['style'],
): style is (state: PressableStateCallbackType) => StyleProp<ViewStyle> {
  return typeof style === 'function';
}

function getPressedStyle(style: StyleProp<ViewStyle>, pressedOpacity: number, pressedScale: number): ViewStyle {
  const flattenedStyle = StyleSheet.flatten(style) ?? {};
  const pressedStyle: ViewStyle = {
    opacity:
      typeof flattenedStyle.opacity === 'number'
        ? Math.max(0, Math.min(1, flattenedStyle.opacity * pressedOpacity))
        : pressedOpacity,
  };

  if (Array.isArray(flattenedStyle.transform)) {
    pressedStyle.transform = [...flattenedStyle.transform, { scale: pressedScale }];
  } else if (!flattenedStyle.transform) {
    pressedStyle.transform = [{ scale: pressedScale }];
  }

  return pressedStyle;
}

export const FeedbackPressable = forwardRef<View, FeedbackPressableProps>(function FeedbackPressable(
  {
    style,
    disabled,
    android_ripple,
    disableDefaultFeedback = false,
    pressedOpacity = DEFAULT_PRESSED_OPACITY,
    pressedScale = DEFAULT_PRESSED_SCALE,
    ...props
  },
  ref,
) {
  const resolvedStyle = useCallback(
    (state: PressableStateCallbackType) => {
      if (isStyleCallback(style)) {
        return style(state);
      }

      if (!state.pressed || disabled || disableDefaultFeedback) {
        return style;
      }

      return [style, getPressedStyle(style, pressedOpacity, pressedScale)];
    },
    [disableDefaultFeedback, disabled, pressedOpacity, pressedScale, style],
  );

  return (
    <RNPressable
      ref={ref}
      {...props}
      disabled={disabled}
      android_ripple={android_ripple ?? (Platform.OS === 'android' && !disabled ? DEFAULT_ANDROID_RIPPLE : undefined)}
      style={resolvedStyle}
    />
  );
});
