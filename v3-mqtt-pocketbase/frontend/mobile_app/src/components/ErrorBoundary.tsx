import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({
      error,
      errorInfo,
    });

    console.error('ErrorBoundary caught an error:', error);
    console.error('Error info:', errorInfo);

    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    if (
      typeof window !== 'undefined' &&
      typeof window.dispatchEvent === 'function' &&
      typeof CustomEvent === 'function'
    ) {
      try {
        window.dispatchEvent(new CustomEvent('unhandled-error', {
          detail: { error, errorInfo }
        }));
      } catch {
        // Best effort — some environments lack CustomEvent
      }
    }
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <SafeAreaView style={styles.container}>
          <View style={styles.content}>
            <Text style={styles.title}>Oops! Something went wrong</Text>
            <Text style={styles.subtitle}>
              We're sorry, but an unexpected error occurred while loading this page.
            </Text>
            
            <View style={styles.errorDetails}>
              <Text style={styles.errorTitle}>Error Details:</Text>
              <Text style={styles.errorText} numberOfLines={3}>
                {this.state.error?.message || 'Unknown error occurred'}
              </Text>
            </View>

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.button, styles.retryButton]}
                onPress={this.handleRetry}
                accessibilityRole="button"
                accessibilityLabel="Retry loading this page"
                accessibilityHint="Attempt to reload the current screen"
              >
                <Text style={styles.retryButtonText}>Try Again</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.button, styles.homeButton]}
                onPress={() => {
                  if (typeof window !== 'undefined') {
                    window.location.href = '/';
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel="Go to home page"
                accessibilityHint="Navigate to the main application screen"
              >
                <Text style={styles.homeButtonText}>Go Home</Text>
              </TouchableOpacity>
            </View>

            {__DEV__ && this.state.error && this.state.errorInfo && (
              <View style={styles.debugInfo}>
                <Text style={styles.debugTitle}>Debug Information (Development):</Text>
                <Text style={styles.debugText}>
                  Stack Trace: {this.state.errorInfo.componentStack}
                </Text>
              </View>
            )}
          </View>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}

const ErrorBoundaryWithTheme = ({ children, ...props }: Props) => {
  const fallback = (
    <SafeAreaView style={styles.container}>
      <View style={[styles.content, { backgroundColor: '#2D2D44' }]}>
        <Text style={[styles.title, { color: '#FF6B6B' }]}>Oops! Something went wrong</Text>
        <Text style={[styles.subtitle, { color: '#B0B0B0' }]}>
          We're sorry, but an unexpected error occurred while loading this page.
        </Text>
        
        <View style={[styles.errorDetails, { backgroundColor: '#2D2D44' }]}>
          <Text style={[styles.errorTitle, { color: '#B0B0B0' }]}>Error Details:</Text>
          <Text style={[styles.errorText, { color: '#FFFFFF' }]} numberOfLines={3}>
            An error occurred in the application
          </Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.button, styles.retryButton, { backgroundColor: '#1E8449' }]}
            onPress={() => {
                if (typeof window !== 'undefined' && window.location) {
                  window.location.reload();
                }
              }}
            accessibilityRole="button"
            accessibilityLabel="Retry loading this page"
            accessibilityHint="Attempt to reload the current screen"
          >
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.button, styles.homeButton, { backgroundColor: '#4A4A6A' }]}
            onPress={() => {
              if (typeof window !== 'undefined' && window.location) {
                window.location.href = '/';
              }
            }}
            accessibilityRole="button"
            accessibilityLabel="Go to home page"
            accessibilityHint="Navigate to the main application screen"
          >
            <Text style={styles.homeButtonText}>Go Home</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );

  return (
    <ErrorBoundary fallback={fallback} {...props}>
      {children}
    </ErrorBoundary>
  );
};

export default ErrorBoundaryWithTheme;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A1A2E',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 48,
    textAlign: 'center',
  },
  errorDetails: {
    backgroundColor: '#2D2D44',
    borderRadius: 12,
    padding: 16,
    marginBottom: 48,
    width: '100%',
    borderWidth: 1,
    borderColor: '#4A4A6A',
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#B0B0B0',
  },
  errorText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontFamily: 'monospace',
  },
  actions: {
    flexDirection: 'row',
    gap: 16,
    width: '100%',
    justifyContent: 'center',
  },
  button: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryButton: {
    backgroundColor: '#1E8449',
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  homeButton: {
    backgroundColor: '#4A4A6A',
  },
  homeButtonText: {
    color: '#B0B0B0',
    fontSize: 16,
    fontWeight: '500',
  },
  debugInfo: {
    marginTop: 48,
    padding: 16,
    backgroundColor: '#2D2D44',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4A4A6A',
    width: '100%',
  },
  debugTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#B0B0B0',
  },
  debugText: {
    fontSize: 11,
    color: '#FFFFFF',
    fontFamily: 'monospace',
    lineHeight: 16,
  },
});