import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { router } from 'expo-router';
import { Theme } from '../constants/Theme';


export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

    const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter both email and password.');
      return;
    }

    setLoading(true);
    try {
      const { signInWithEmailAndPassword } = await import('firebase/auth');
      const { auth } = await import('../utils/firebase');
      await signInWithEmailAndPassword(auth, email.trim(), password);
      Alert.alert('Success', 'Connected to Sovereign Aqua Protocol.');
      router.back();
    } catch (err: unknown) {
      Alert.alert('Authentication Failed', err instanceof Error ? err.message : 'Invalid credentials or API keys missing.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        {/* 'X' Close Button */}
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>

        <Text style={styles.title}>ADMIN ACCESS</Text>
        <Text style={styles.subtitle}>Enter authorized credentials to connect</Text>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>EMAIL</Text>
          <TextInput
            style={styles.input}
            placeholder="admin@farm.local"
            placeholderTextColor={Theme.colors.textMuted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>PASSWORD</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••"
            placeholderTextColor={Theme.colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>

        <TouchableOpacity 
          style={styles.loginBtn} 
          onPress={handleLogin}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color={Theme.colors.background} />
          ) : (
            <Text style={styles.loginBtnText}>AUTHENTICATE</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.guestBtn} 
          onPress={() => router.back()}
        >
          <Text style={styles.guestBtnText}>Return as Guest</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#05050A',
    justifyContent: 'center',
    padding: Theme.spacing.lg,
  },
  card: {
    backgroundColor: Theme.colors.background,
    padding: Theme.spacing.xl,
    borderRadius: Theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: Theme.colors.primary,
    shadowColor: Theme.colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 15,
    elevation: 10,
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    position: 'relative',
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.colors.surface,
    borderRadius: 16,
    zIndex: 10,
  },
  closeBtnText: {
    color: Theme.colors.textMuted,
    fontSize: 18,
    fontWeight: 'bold',
  },
  title: {
    fontSize: Theme.typography.h1,
    color: Theme.colors.primary,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: Theme.typography.caption,
    color: Theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: Theme.spacing.xl,
    marginTop: 4,
  },
  inputContainer: {
    marginBottom: Theme.spacing.lg,
  },
  label: {
    color: Theme.colors.primary,
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 8,
    letterSpacing: 1,
  },
  input: {
    backgroundColor: Theme.colors.surface,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
    borderRadius: Theme.borderRadius.md,
    color: Theme.colors.text,
    padding: Theme.spacing.md,
    fontSize: Theme.typography.body,
  },
  loginBtn: {
    backgroundColor: Theme.colors.primary,
    padding: Theme.spacing.md,
    borderRadius: Theme.borderRadius.md,
    alignItems: 'center',
    marginTop: Theme.spacing.md,
  },
  loginBtnText: {
    color: Theme.colors.background,
    fontSize: Theme.typography.h3,
    fontWeight: '900',
    letterSpacing: 1,
  },
  guestBtn: {
    padding: Theme.spacing.md,
    alignItems: 'center',
    marginTop: Theme.spacing.sm,
  },
  guestBtnText: {
    color: Theme.colors.textMuted,
    fontSize: Theme.typography.body,
    textDecorationLine: 'underline',
  }
});
