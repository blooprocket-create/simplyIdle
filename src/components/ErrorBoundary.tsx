import React, { Component, ErrorInfo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

interface Props {
  children: React.ReactNode;
  /** Label shown in the fallback UI so users know which section failed. */
  label?: string;
  /** If provided, called when an error is caught. */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Optional custom fallback UI. */
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Generic error boundary that catches render errors in its subtree
 * and displays a recoverable fallback UI instead of crashing the app.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.props.onError?.(error, errorInfo);
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <View style={styles.container}>
          <Text style={styles.icon}>⚠️</Text>
          <Text style={styles.title}>
            {this.props.label ? `${this.props.label} encountered an error` : 'Something went wrong'}
          </Text>
          <Text style={styles.detail}>
            {this.state.error?.message ?? 'Unknown error'}
          </Text>
          <Pressable style={styles.retryButton} onPress={this.handleRetry}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#0D0D18',
    borderRadius: 12,
    margin: 8,
  },
  icon: {
    fontSize: 32,
    marginBottom: 12,
  },
  title: {
    color: '#FFB347',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  detail: {
    color: '#9A9AB0',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
    maxWidth: 300,
  },
  retryButton: {
    backgroundColor: '#2A2A3E',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFB347',
  },
  retryText: {
    color: '#FFB347',
    fontSize: 14,
    fontWeight: '600',
  },
});
