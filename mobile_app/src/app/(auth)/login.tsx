import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../utils/firebase';
import { Theme } from '../../constants/Theme';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAuth = async () => {
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }
    
    setLoading(true);
    setError('');

    try {
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
      // Real Firebase Auth session is now active
      router.replace('/(tabs)');
    } catch (err: any) {
      // Friendly error messages
      const code = err.code || '';
      if (code.includes('user-not-found') || code.includes('invalid-credential')) {
        setError('Invalid credentials. Check your email and password.');
      } else if (code.includes('wrong-password')) {
        setError('Incorrect password.');
      } else if (code.includes('email-already-in-use')) {
        setError('This email is already registered. Try logging in.');
      } else {
        setError(err.message || 'Authentication failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Sentinel Soul</Text>
        <Text style={styles.subtitle}>Pig Health Monitor 🐾</Text>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Farm Email</Text>
          <TextInput
            style={styles.input}
            placeholder="admin@farm.local"
            placeholderTextColor="#666"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Access Key</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor="#666"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <TouchableOpacity 
          style={styles.primaryButton} 
          onPress={handleAuth}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.primaryButtonText}>
              {isRegistering ? 'INITIALIZE FARM' : 'AUTHENTICATE'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.skipButton} 
          onPress={() => router.replace('/(tabs)')}
        >
          <Text style={styles.skipButtonText}>
            CONTINUE AS GUEST →
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.secondaryButton} 
          onPress={() => {
            setIsRegistering(!isRegistering);
            setError('');
          }}
        >
          <Text style={styles.secondaryButtonText}>
            {isRegistering 
              ? 'Already registered? Return to Login' 
              : 'New hardware? Initialize Farm'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: Theme.colors.card,
    padding: 30,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
    shadowColor: Theme.colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: Theme.colors.primary,
    textAlign: 'center',
    marginBottom: 5,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 16,
    color: Theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 40,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    color: Theme.colors.primary,
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginBottom: 8,
    letterSpacing: 1,
  },
  input: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
    borderRadius: 10,
    padding: 15,
    color: Theme.colors.text,
    fontSize: 16,
  },
  errorText: {
    color: Theme.colors.danger,
    textAlign: 'center',
    marginBottom: 20,
    fontSize: 14,
  },
  primaryButton: {
    backgroundColor: Theme.colors.primary,
    padding: 18,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  primaryButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  skipButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Theme.colors.textMuted,
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 15,
  },
  skipButtonText: {
    color: Theme.colors.textMuted,
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  secondaryButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: Theme.colors.textSecondary,
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
