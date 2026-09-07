import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Platform, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../theme';
import { haptic } from '../utils/haptics';
import { loginWithEmail, loginAdmin } from '../utils/pocketbase-auth';

type Role = 'user' | 'admin';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('user');
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
      if (role === 'admin') {
        await loginAdmin(email, password);
      } else {
        await loginWithEmail(email, password);
      }
      haptic('success');
      setSuccess(true);
      setError(null);
      setTimeout(() => router.replace('/tabs'), 600);
    } catch (err: unknown) {
      haptic('error');
      const msg = err instanceof Error ? err.message : 'Invalid credentials.';
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
      'Guest access shows demo figures. Sign in as an end-user for live herd data, or as admin for the mock-data review view.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue as Guest',
          onPress: () => router.replace('/tabs'),
          style: 'default',
        },
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
        },
      ]}>
        <TouchableOpacity
          style={[
            styles.closeBtn,
            { backgroundColor: theme.colors.surfaceVariant },
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

        {/* Role toggle — admin sees mock data & files (legacy demo), end-user sees live herd */}
        <View style={styles.roleRow}>
          {(['user', 'admin'] as Role[]).map((r) => (
            <TouchableOpacity
              key={r}
              style={[
                styles.roleBtn,
                {
                  backgroundColor: role === r ? theme.colors.primary : theme.colors.surfaceVariant,
                },
              ]}
              onPress={() => { haptic('light'); setRole(r); }}
              accessibilityRole="button"
              accessibilityLabel={`${r === 'admin' ? 'Admin' : 'End-user'} sign-in`}
              accessibilityState={{ selected: role === r }}
            >
              <Text
                style={[
                  styles.roleBtnText,
                  { color: role === r ? theme.colors.onAccent : theme.colors.textSecondary },
                ]}
              >
                {r === 'admin' ? 'ADMIN' : 'END-USER'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={[styles.roleHint, { color: theme.colors.textMuted }]}>
          {role === 'admin'
            ? 'Admin — mock data & files, legacy-style demo review.'
            : 'End-user — live herd data from the MQTT→PocketBase pipeline.'}
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
              },
            ]}
            placeholder={role === 'admin' ? 'admin@pigpulse.local' : 'farmer@farm.local'}
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
              },
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
            { backgroundColor: theme.colors.primary },
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
            },
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
            },
          ]}>
            <Text style={[styles.feedbackSuccess, { color: theme.colors.success }]}>✅ Authentication successful!</Text>
          </View>
        )}

        {!isWeb && (
          <View style={{ marginTop: 24, alignItems: 'center' }}>
            <Text style={[styles.guestBtnText, { color: theme.colors.textSecondary }]}>
              Self-hosted PocketBase auth.
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
  roleRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  roleBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  roleBtnText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  roleHint: {
    fontSize: 12.5,
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 17,
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