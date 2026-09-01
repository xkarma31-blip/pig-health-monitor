import { Alert } from 'react-native';

export interface ErrorHandlerOptions {
  showUserMessage?: boolean;
  logToConsole?: boolean;
  showToast?: boolean;
  retryEnabled?: boolean;
  fallbackAction?: () => void;
}

export class GlobalErrorHandler {
  private static instance: GlobalErrorHandler;
  private errorCallbacks: Array<(error: Error, errorInfo?: any) => void> = [];

  static getInstance(): GlobalErrorHandler {
    if (!GlobalErrorHandler.instance) {
      GlobalErrorHandler.instance = new GlobalErrorHandler();
    }
    return GlobalErrorHandler.instance;
  }

  addErrorCallback(callback: (error: Error, errorInfo?: any) => void): void {
    this.errorCallbacks.push(callback);
  }

  removeErrorCallback(callback: (error: Error, errorInfo?: any) => void): void {
    const index = this.errorCallbacks.indexOf(callback);
    if (index > -1) {
      this.errorCallbacks.splice(index, 1);
    }
  }

  handleError(error: Error, errorInfo?: any, options: ErrorHandlerOptions = {}): void {
    const {
      showUserMessage = true,
      logToConsole = true,
      retryEnabled = true,
      fallbackAction,
    } = options;

    // Log to console
    if (logToConsole) {
      console.error('Global Error Handler:', error);
      if (errorInfo) {
        console.error('Error Info:', errorInfo);
      }
    }

    // Notify all error callbacks
    this.errorCallbacks.forEach(callback => {
      try {
        callback(error, errorInfo);
      } catch (callbackError) {
        console.error('Error in error callback:', callbackError);
      }
    });

    // Show user-friendly message
    if (showUserMessage) {
      this.showUserFriendlyError(error, retryEnabled, fallbackAction);
    }
  }

  private showUserFriendlyError(
    error: Error,
    retryEnabled: boolean,
    fallbackAction?: () => void
  ): void {
    let message = 'Something went wrong. Please try again.';
    
    // More specific messages for common error types
    if (error.message.includes('Network Error') || error.message.includes('fetch')) {
      message = 'Network connection failed. Please check your internet connection and try again.';
    } else if (error.message.includes('Authentication')) {
      message = 'Authentication failed. Please sign in again.';
    } else if (error.message.includes('Permission')) {
      message = 'Permission denied. Please check your device permissions.';
    } else if (error.message.includes('Timeout')) {
      message = 'Request timed out. Please try again.';
    }

    if (typeof window !== 'undefined' && (window as any).showToast) {
      // Use toast if available
      (window as any).showToast(message, 'error');
    } else {
      // Fall back to Alert
      Alert.alert(
        'Error',
        message,
        [
          {
            text: 'OK',
            style: 'default' as const,
          },
          ...(retryEnabled ? [
            {
              text: 'Retry',
              onPress: () => {
                if (typeof window !== 'undefined' && window.location) {
                  window.location.reload();
                }
              },
              style: 'default' as const,
            }
          ] : []),
          ...(fallbackAction ? [
            {
              text: 'Go Back',
              onPress: fallbackAction,
              style: 'cancel' as const,
            }
          ] : []),
        ]
      );
    }
  }

  // Factory methods for common error types
  static handleNetworkError(error: Error, options?: ErrorHandlerOptions): void {
    GlobalErrorHandler.getInstance().handleError(error, { type: 'network' }, {
      ...options,
      showUserMessage: true,
      logToConsole: true,
    });
  }

  static handleAuthError(error: Error, options?: ErrorHandlerOptions): void {
    GlobalErrorHandler.getInstance().handleError(error, { type: 'authentication' }, {
      ...options,
      showUserMessage: true,
      logToConsole: true,
    });
  }

  static handlePermissionError(error: Error, options?: ErrorHandlerOptions): void {
    GlobalErrorHandler.getInstance().handleError(error, { type: 'permission' }, {
      ...options,
      showUserMessage: true,
      logToConsole: true,
    });
  }

  static handleTimeoutError(error: Error, options?: ErrorHandlerOptions): void {
    GlobalErrorHandler.getInstance().handleError(error, { type: 'timeout' }, {
      ...options,
      showUserMessage: true,
      logToConsole: true,
    });
  }

  static handleUnknownError(error: Error, errorInfo?: any, options?: ErrorHandlerOptions): void {
    GlobalErrorHandler.getInstance().handleError(error, errorInfo, {
      ...options,
      showUserMessage: true,
      logToConsole: true,
    });
  }
}

// Hook for functional components
export function useErrorHandler() {
  const handleError = (error: Error, errorInfo?: any, options?: ErrorHandlerOptions) => {
    GlobalErrorHandler.handleUnknownError(error, errorInfo, options);
  };

  const handleNetworkError = (error: Error, options?: ErrorHandlerOptions) => {
    GlobalErrorHandler.handleNetworkError(error, options);
  };

  const handleAuthError = (error: Error, options?: ErrorHandlerOptions) => {
    GlobalErrorHandler.handleAuthError(error, options);
  };

  const handlePermissionError = (error: Error, options?: ErrorHandlerOptions) => {
    GlobalErrorHandler.handlePermissionError(error, options);
  };

  const handleTimeoutError = (error: Error, options?: ErrorHandlerOptions) => {
    GlobalErrorHandler.handleTimeoutError(error, options);
  };

  return {
    handleError,
    handleNetworkError,
    handleAuthError,
    handlePermissionError,
    handleTimeoutError,
  };
}

// Safe wrapper for async operations
export async function safeAsyncOperation<T>(
  operation: () => Promise<T>,
  errorHandler?: (error: Error) => void
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    
    if (errorHandler) {
      errorHandler(errorObj);
    } else {
      GlobalErrorHandler.handleUnknownError(errorObj);
    }
    
    return null;
  }
}

// Safe wrapper for sync operations
export function safeSyncOperation<T>(
  operation: () => T,
  errorHandler?: (error: Error) => void
): T | null {
  try {
    return operation();
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    
    if (errorHandler) {
      errorHandler(errorObj);
    } else {
      GlobalErrorHandler.handleUnknownError(errorObj);
    }
    
    return null;
  }
}

// Retry mechanism with exponential backoff
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000,
  backoffFactor: number = 2
): Promise<T | null> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === maxRetries) {
        break;
      }
      
      const delay = initialDelay * Math.pow(backoffFactor, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  if (lastError) {
    GlobalErrorHandler.handleUnknownError(lastError);
    return null;
  }
  
  return null;
}

// Global error event listener
// Web only: React Native's global `window` has no `addEventListener`, so these
// must never run on native (they throw "undefined is not a function").
if (
  typeof window !== 'undefined' &&
  typeof window.addEventListener === 'function'
) {
  window.addEventListener('error', (event) => {
    GlobalErrorHandler.handleUnknownError(
      new Error(event.message),
      {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error,
      }
    );
  });

  window.addEventListener('unhandledrejection', (event) => {
    GlobalErrorHandler.handleUnknownError(
      new Error(event.reason instanceof Error ? event.reason.message : String(event.reason)),
      {
        type: 'unhandled-promise-rejection',
        reason: event.reason,
      }
    );
  });
}

export default GlobalErrorHandler;