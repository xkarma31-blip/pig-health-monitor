import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Platform, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { router } from 'expo-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../utils/firebase';
import { useTheme } from '../theme';
import { haptic } from '../utils/haptics';

function googleSignIn() {
  if (Platform.OS !== 'web') {
    return;
  }
  import('firebase/auth')
    .then(({ signInWithRedirect, GoogleAuthProvider }) => {
      const provider = new GoogleAuthProvider();
      return signInWithRedirect(auth, provider);
    })
    .catch((err: unknown) => {
      haptic('error');
      const msg = err instanceof Error ? err.message : 'Google sign-in failed.';
      Alert.alert('Google Sign-In Failed', msg);
    });
}

function facebookSignIn() {
  if (Platform.OS !== 'web') {
    return;
  }
  import('firebase/auth')
    .then(({ signInWithRedirect, FacebookAuthProvider }) => {
      const provider = new FacebookAuthProvider();
      return signInWithRedirect(auth, provider);
    })
    .catch((err: unknown) => {
      haptic('error');
      const msg = err instanceof Error ? err.message : 'Facebook sign-in failed.';
      Alert.alert('Facebook Sign-In Failed', msg);
    });
}

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const { theme } = useTheme();

  const isWeb = Platform.OS === 'web';

  const handleLogin = async () => {
    if (!email || !password) {
      haptic('warning');
      setError('Please enter both email and password.');
      setSuccess(false);
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      haptic('success');
      setSuccess(true);
      setError(null);
      setTimeout(() => router.replace('/web/dashboard'), 600);
    } catch (err: unknown) {
      haptic('error');
      const msg = err instanceof Error ? err.message : 'Invalid credentials or API keys missing.';
      setError(msg);
      setSuccess(false);
    } finally {
      setLoading(false);
    }
  };

  const handleGuestAccess = () => {
    haptic('light');
    Alert.alert(
      'Guest Access',
      'Guest access provides limited functionality. Sign in for full access to all features.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Continue as Guest', 
          onPress: () => router.replace('/web/dashboard'),
          style: 'default'
        }
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[
        styles.card, 
        { 
          backgroundColor: theme.colors.surface, 
          borderColor: theme.colors.border,
          shadowColor: theme.colors.shadow,
        }
      ]}>
        <TouchableOpacity
          style={[
            styles.closeBtn, 
            { backgroundColor: theme.colors.surfaceVariant }
          ]}
          onPress={() => { haptic('light'); router.back(); }}
          accessibilityRole="button"
          accessibilityLabel="Close login"
          accessibilityHint="Returns to the previous screen"
        >
          <Text style={[styles.closeBtnText, { color: theme.colors.textSecondary }]}>✕</Text>
        </TouchableOpacity>

        <Text style={[styles.title, { color: theme.colors.primary }]}>Pig Health Monitor</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
          Sign in to access your farm monitoring dashboard
        </Text>

        <View style={styles.inputContainer}>
          <Text style={[styles.label, { color: theme.colors.textSecondary }]}>EMAIL</Text>
          <TextInput
            style={[
              styles.input, 
              { 
                backgroundColor: theme.colors.backgroundVariant,
                borderColor: theme.colors.border,
                color: theme.colors.textPrimary,
              }
            ]}
            placeholder="admin@farm.local"
            placeholderTextColor={theme.colors.textDisabled}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            accessibilityLabel="Email address"
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={[styles.label, { color: theme.colors.textSecondary }]}>PASSWORD</Text>
          <TextInput
            style={[
              styles.input, 
              { 
                backgroundColor: theme.colors.backgroundVariant,
                borderColor: theme.colors.border,
                color: theme.colors.textPrimary,
              }
            ]}
            placeholder="••••••"
            placeholderTextColor={theme.colors.textDisabled}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            accessibilityLabel="Password"
          />
        </View>

        <TouchableOpacity
          style={[
            styles.loginBtn, 
            { backgroundColor: theme.colors.primary }
          ]}
          onPress={handleLogin}
          disabled={loading}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Authenticate"
        >
          {loading ? (
            <ActivityIndicator color={theme.colors.onAccent} />
          ) : (
            <Text style={[styles.loginBtnText, { color: theme.colors.onAccent }]}>SIGN IN</Text>
          )}
        </TouchableOpacity>

        {error && (
          <View style={[
            styles.feedbackBox, 
            { 
              backgroundColor: theme.colors.errorContainer + '20',
              borderColor: theme.colors.error,
            }
          ]}>
            <Text style={[styles.feedbackError, { color: theme.colors.error }]}>⚠️ {error}</Text>
          </View>
        )}

        {success && (
          <View style={[
            styles.feedbackBox, 
            { 
              backgroundColor: theme.colors.successContainer + '20',
              borderColor: theme.colors.success,
            }
          ]}>
            <Text style={[styles.feedbackSuccess, { color: theme.colors.success }]}>✅ Authentication successful!</Text>
          </View>
        )}

        {isWeb && (
          <>
            <Text style={[styles.divider, { color: theme.colors.textSecondary }]}>OR CONTINUE WITH</Text>

            <TouchableOpacity 
              style={[
                styles.socialBtn, 
                { backgroundColor: theme.colors.surfaceVariant }
              ]} 
              onPress={googleSignIn}
            >
              <Text style={[styles.socialBtnIcon, { color: theme.colors.textSecondary }]}>G</Text>
              <Text style={[styles.socialBtnText, { color: theme.colors.textPrimary }]}>Sign in with Google</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[
                styles.socialBtn, 
                { backgroundColor: theme.colors.facebook }
              ]} 
              onPress={facebookSignIn}
            >
              <Text style={[styles.socialBtnIcon, { color: theme.colors.white }]}>f</Text>
              <Text style={[styles.socialBtnText, { color: theme.colors.white }]}>Sign in with Facebook</Text>
            </TouchableOpacity>
          </>
        )}

        {!isWeb && (
          <View style={{ marginTop: 24, alignItems: 'center' }}>
            <Text style={[styles.socialBtnText, { color: theme.colors.textSecondary }]}>
              Social login is available on web only.
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.guestBtn}
          onPress={handleGuestAccess}
          accessibilityRole="button"
          accessibilityLabel="Continue as guest"
        >
          <Text style={[styles.guestBtnText, { color: theme.colors.textSecondary }]}>Continue as Guest</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    padding: 32,
    borderRadius: 16,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    position: 'relative',
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    zIndex: 10,
  },
  closeBtnText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 20,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    minHeight: 48,
  },
  loginBtn: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    minHeight: 48,
  },
  loginBtnText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  feedbackBox: {
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  feedbackError: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 20,
  },
  feedbackSuccess: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 20,
  },
  divider: {
    textAlign: 'center',
    marginVertical: 24,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    minHeight: 48,
    borderWidth: 1,
  },
  socialBtnIcon: {
    fontSize: 20,
    fontWeight: '900',
    marginRight: 12,
    width: 24,
    textAlign: 'center',
  },
  socialBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
  guestBtn: {
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
    borderRadius: 12,
  },
  guestBtnText: {
    fontSize: 16,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});