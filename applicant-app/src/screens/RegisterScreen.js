import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { ResponseType } from 'expo-auth-session';
import Constants from 'expo-constants';
import { useAuth } from '../context/AuthContext';

WebBrowser.maybeCompleteAuthSession();

export default function RegisterScreen({ navigation }) {
  const { googleLogin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: Constants.expoConfig?.extra?.googleClientId,
    androidClientId: Constants.expoConfig?.extra?.googleAndroidClientId,
    iosClientId: Constants.expoConfig?.extra?.googleIosClientId,
    scopes: ['openid', 'profile', 'email'],
    responseType: ResponseType.Token,
    usePKCE: false,
  });

  useEffect(() => {
    if (response?.type === 'success') {
      handleGoogleToken(response.params.access_token);
    } else if (response?.type === 'error' || response?.type === 'dismiss') {
      setLoading(false);
      if (response?.type === 'error')
        setError('Google sign-in was cancelled or failed. Please try again.');
    }
  }, [response]);

  const handleGoogleRegister = async () => {
    setError('');
    setLoading(true);
    await promptAsync();
  };

  const handleGoogleToken = async (accessToken) => {
    try {
      const result = await googleLogin(accessToken);
      if (result.success) return;
      if (result.isPending && result.isNew) { setSuccess(true); return; }
      if (result.isPending) {
        setError(result.message || 'Your account is already registered and pending admin approval.');
        return;
      }
      setError(result.error || 'Registration failed. Please try again.');
    } catch {
      setError('Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successContainer}>
          <View style={styles.successIconContainer}>
            <Text style={styles.successIcon}>✓</Text>
          </View>
          <Text style={styles.successTitle}>Registration Submitted!</Text>
          <Text style={styles.successMessage}>Your eLoan account has been created.</Text>
          <Text style={styles.successSubMessage}>
            Your account is pending administrator approval.
          </Text>
          <TouchableOpacity style={styles.loginButton} onPress={() => navigation.navigate('Login')}>
            <Text style={styles.loginButtonText}>Back to Login</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Text style={styles.logoIcon}>💰</Text>
            <Text style={styles.logoText}>eLoan</Text>
          </View>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Bukidnon State University</Text>
        </View>

        {/* Error */}
        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Google Register */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>NOTE:</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoBullet}>ℹ</Text>
            <Text style={styles.infoText}>
              Account requires administrator approval before you can apply for loans
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.manualButton}
          onPress={() => navigation.navigate('RegisterWizard')}
          disabled={loading}
          activeOpacity={0.8}
        >
          <Text style={styles.manualButtonText}>Register</Text>
        </TouchableOpacity>

        {/* Login link */}
        <View style={styles.loginLinkContainer}>
          <Text style={styles.loginLinkText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')} disabled={loading}>
            <Text style={styles.loginLink}>Login</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#f5f5f5' 
  },
  scrollContent: { 
    flexGrow: 1, 
    padding: 24, 
    justifyContent: 'center' 
  },
  header: { 
    alignItems: 'center', 
    marginBottom: 28 

  },
  logoContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginBottom: 10 
  },
  logoIcon: { 
    fontSize: 36, 
    marginRight: 8 
  },
  logoText: { 
    fontSize: 28, 
    fontWeight: 'bold', 
    color: '#1f2937' 
  },
  title: { 
    fontSize: 24, 
    fontWeight: '600',
    color: '#1f2937' 
  },
  subtitle: { 
    fontSize: 14, 
    color: '#6b7280', 
    marginTop: 4 
  },
  errorContainer: { 
    backgroundColor: '#fee2e2', 
    borderRadius: 8, 
    padding: 12, 
    marginBottom: 16 
  },
  errorText: { 
    color: '#dc2626', 
    fontSize: 14, 
    lineHeight: 20 
  },
  infoCard: {
    backgroundColor: '#eff6ff', 
    borderRadius: 12, 
    padding: 16, 
    marginBottom: 20,
    borderWidth: 1, 
    borderColor: '#bfdbfe',
  },
  infoTitle: { 
    fontSize: 14, 
    fontWeight: '700', 
    color: '#1d4ed8', 
    marginBottom: 10 
  },
  infoRow: { 
    flexDirection: 'row', 
    alignItems: 'flex-start', 
    marginBottom: 6 
  },
  infoBullet: { 
    fontSize: 14, 
    color: '#1d4ed8', 
    marginRight: 8, 
    marginTop: 1 },
  infoText: { 
    flex: 1, 
    fontSize: 13, 
    color: '#1e40af', 
    lineHeight: 19 
  },
  infoHighlight: { 
    fontWeight: '700' 
  },
  googleButton: {
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center',
    backgroundColor: '#fff', 
    borderWidth: 1.5, 
    borderColor: '#d1d5db',
    borderRadius: 10, 
    padding: 16, 
    marginBottom: 8, 
    elevation: 1,
  },
  // googleIcon: { fontSize: 18, fontWeight: '700', color: '#4285F4', marginRight: 10 },
  // googleButtonText: { color: '#374151', fontSize: 16, fontWeight: '600' },
  // domainHint: { textAlign: 'center', fontSize: 12, color: '#9ca3af', marginBottom: 16 },
  // dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 4, marginBottom: 16 },
  // divider: { flex: 1, height: 1, backgroundColor: '#e5e7eb' },
  // dividerText: { marginHorizontal: 12, fontSize: 13, color: '#9ca3af', fontWeight: '500' },
  manualButton: {
    backgroundColor: '#02327a', 
    borderRadius: 10, 
    padding: 16,
    alignItems: 'center', 
    marginBottom: 8,
  },
  manualButtonText: { 
    color: '#fff', 
    fontSize: 16, 
    fontWeight: '600' 
  },
  buttonDisabled: { 
    opacity: 0.5 
  },
  loginLinkContainer: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    alignItems: 'center',
    marginTop: 12 
  },
  loginLinkText: { 
    color: '#6b7280', 
    fontSize: 14 
  },
  loginLink: {
    color: '#17236a',
    fontSize: 14,
    fontWeight: '600',
  },
  // Success screen
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  successIconContainer: {
    width: 80, 
    height: 80, 
    borderRadius: 40, 
    backgroundColor: '#10b981',
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: 24,
  },
  successIcon: { 
    fontSize: 40, 
    color: '#fff' 
  },
  successTitle: { 
    fontSize: 24, 
    fontWeight: '700', 
    color: '#1f2937', 
    marginBottom: 12 
  },
  successMessage: { 
    fontSize: 15, 
    color: '#6b7280', 
    textAlign: 'center', 
    lineHeight: 22, 
    marginBottom: 8 },
  successSubMessage: { 
    fontSize: 13,
    color: '#9ca3af', 
    textAlign: 'center', 
    lineHeight: 20, 
    marginBottom: 32 
  },
  loginButton: {
    backgroundColor: '#17236a',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  loginButtonText: { 
    color: '#fff', 
    fontSize: 16,
     fontWeight: '600' 
    },
});