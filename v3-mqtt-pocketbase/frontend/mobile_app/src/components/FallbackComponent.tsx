import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface FallbackComponentProps {
  error?: Error | null;
  isLoading?: boolean;
  isEmpty?: boolean;
  message?: string;
  actionText?: string;
  onAction?: () => void;
  type?: 'error' | 'loading' | 'empty' | 'network';
}

export const FallbackComponent: React.FC<FallbackComponentProps> = ({
  error,
  isLoading = false,
  isEmpty = false,
  message,
  actionText = 'Try Again',
  onAction,
  type = 'error',
}) => {
  const getFallbackContent = () => {
    if (isLoading) {
      return (
        <View style={[styles.loadingContainer, { backgroundColor: '#2D2D44' }]}>
          <View style={[styles.loadingSpinner, { backgroundColor: '#1E8449' }]} />
          <Text style={[styles.loadingText, { color: '#B0B0B0' }]}>
            {message || 'Loading...'}
          </Text>
        </View>
      );
    }

    if (isEmpty) {
      return (
        <View style={[styles.emptyContainer, { backgroundColor: '#2D2D44' }]}>
          <View style={[styles.emptyIcon, { backgroundColor: '#3D3D5C' }]}>
            <Text style={[styles.emptyIconText, { color: '#B0B0B0' }]}>📋</Text>
          </View>
          <Text style={[styles.emptyTitle, { color: '#FFFFFF' }]}>
            {message || 'No Data Available'}
          </Text>
          <Text style={[styles.emptyDescription, { color: '#B0B0B0' }]}>
            There are no items to display at the moment.
          </Text>
        </View>
      );
    }

    if (type === 'network') {
      return (
        <View style={[styles.networkContainer, { backgroundColor: '#2D2D44' }]}>
          <View style={[styles.networkIcon, { backgroundColor: '#3D3D5C' }]}>
            <Text style={[styles.networkIconText, { color: '#F39C12' }]}>🌐</Text>
          </View>
          <Text style={[styles.networkTitle, { color: '#FFFFFF' }]}>
            Connection Issue
          </Text>
          <Text style={[styles.networkDescription, { color: '#B0B0B0' }]}>
            Unable to connect to the server. Please check your internet connection.
          </Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: '#1E8449' }]}
            onPress={onAction || (() => { if (typeof window !== 'undefined' && window.location) window.location.reload(); })}
            accessibilityRole="button"
            accessibilityLabel="Retry connection"
            accessibilityHint="Attempt to reconnect to the server"
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // Error fallback
    return (
      <View style={[styles.errorContainer, { backgroundColor: '#2D2D44' }]}>
        <View style={[styles.errorIcon, { backgroundColor: '#3D3D5C' }]}>
          <Text style={[styles.errorIconText, { color: '#FF6B6B' }]}>⚠️</Text>
        </View>
        <Text style={[styles.errorTitle, { color: '#FFFFFF' }]}>
          {error?.message || 'Something went wrong'}
        </Text>
        <Text style={[styles.errorDescription, { color: '#B0B0B0' }]}>
          We encountered an unexpected error. Please try again or contact support.
        </Text>
        <View style={styles.errorActions}>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: '#1E8449' }]}
            onPress={onAction || (() => { if (typeof window !== 'undefined' && window.location) window.location.reload(); })}
            accessibilityRole="button"
            accessibilityLabel="Try again"
            accessibilityHint="Attempt to reload and fix the error"
          >
            <Text style={styles.retryButtonText}>{actionText}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.contactButton, { backgroundColor: '#4A4A6A' }]}
            onPress={() => {
              // Navigate to support or help page
              if (typeof window !== 'undefined' && window.location) {
                window.location.href = '/about';
              }
            }}
            accessibilityRole="button"
            accessibilityLabel="Get help"
            accessibilityHint="Navigate to support and help page"
          >
            <Text style={styles.contactButtonText}>Get Help</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#1A1A2E' }]}>
      <View style={styles.content}>
        {getFallbackContent()}
      </View>
    </SafeAreaView>
  );
};

interface ErrorBoundaryWrapperProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error) => void;
}

export const ErrorBoundaryWrapper: React.FC<ErrorBoundaryWrapperProps> = ({
  fallback,
}) => {
  if (fallback) {
    return fallback;
  }

  return (
    <FallbackComponent
      error={null}
      actionText="Retry"
      onAction={() => window.location.reload()}
    />
  );
};

// Specialized fallback components
export const LoadingFallback: React.FC<{ message?: string }> = ({ message }) => (
  <FallbackComponent isLoading message={message} />
);

export const EmptyFallback: React.FC<{ message?: string }> = ({ message }) => (
  <FallbackComponent isEmpty message={message} />
);

export const NetworkFallback: React.FC = () => (
  <FallbackComponent type="network" />
);

export const ErrorFallback: React.FC<{ error?: Error; message?: string }> = ({
  error,
  message,
}) => (
  <FallbackComponent error={error} message={message} />
);

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
  loadingContainer: {
    alignItems: 'center',
    gap: 24,
  },
  loadingSpinner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    opacity: 0.3,
  },
  loadingText: {
    fontSize: 16,
    textAlign: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    gap: 24,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyIconText: {
    fontSize: 32,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  networkContainer: {
    alignItems: 'center',
    gap: 24,
  },
  networkIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  networkIconText: {
    fontSize: 32,
  },
  networkTitle: {
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
  },
  networkDescription: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  errorContainer: {
    alignItems: 'center',
    gap: 24,
  },
  errorIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorIconText: {
    fontSize: 32,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
  },
  errorDescription: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  errorActions: {
    flexDirection: 'row',
    gap: 16,
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  contactButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  contactButtonText: {
    color: '#B0B0B0',
    fontSize: 16,
    fontWeight: '500',
  },
});

export default FallbackComponent;