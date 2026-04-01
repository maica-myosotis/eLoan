import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import authService from '../services/authService';

export default function ForgotPasswordScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async () => {
    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const response = await authService.forgotPassword(email);
      setMessage(response.message);
      setSubmitted(true);
    } catch (err) {
      setError(err.message || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <View style={styles.successContainer}>
            <View style={styles.successIcon}><Text style={styles.successIconText}>✓</Text></View>
            <Text style={styles.successTitle}>Check your email</Text>
            <Text style={styles.successMessage}>{message}</Text>
            <Text style={styles.successNote}>Please check your email inbox (and spam folder) for the password reset link.</Text>
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}><Text style={styles.backButtonText}>Back to Login</Text></TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.content}>
        <View style={styles.header}>
          <View style={styles.logoContainer}><Text style={styles.logoIcon}>💰</Text><Text style={styles.logoText}>eLoan</Text></View>
          <Text style={styles.title}>Forgot Password?</Text>
          <Text style={styles.subtitle}>Enter your email to receive a password reset link</Text>
        </View>
        <View style={styles.form}>
          {error ? <View style={styles.errorContainer}><Text style={styles.errorText}>{error}</Text></View> : null}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput style={styles.input} placeholder="you@example.com" value={email} onChangeText={(text) => {setEmail(text); setError('');}} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} editable={!loading} />
          </View>
          <TouchableOpacity style={[styles.submitButton, loading && styles.submitButtonDisabled]} onPress={handleSubmit} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>Send Reset Link</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.backToLoginContainer} onPress={() => navigation.goBack()} disabled={loading}><Text style={styles.backToLoginText}>Back to Login</Text></TouchableOpacity>
        </View>
        <View style={styles.footer}><Text style={styles.footerText}>eLoan Management System • Applicant Access</Text></View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f5f5f5'},
  content: {flex: 1, padding: 20, justifyContent: 'center'},
  header: {alignItems: 'center', marginBottom: 40},
  logoContainer: {flexDirection: 'row', alignItems: 'center', marginBottom: 20},
  logoIcon: {fontSize: 40, marginRight: 8},
  logoText: {fontSize: 32, fontWeight: 'bold', color: '#1f2937'},
  title: {fontSize: 24, fontWeight: '600', color: '#1f2937', marginBottom: 8},
  subtitle: {fontSize: 16, color: '#6b7280', textAlign: 'center', paddingHorizontal: 20},
  form: {width: '100%'},
  errorContainer: {backgroundColor: '#fee2e2', borderRadius: 8, padding: 12, marginBottom: 16},
  errorText: {color: '#dc2626', fontSize: 14},
  inputGroup: {marginBottom: 16},
  label: {fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 8},
  input: {backgroundColor: '#fff', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 12, fontSize: 16, color: '#1f2937'},
  submitButton: {backgroundColor: '#17236a', borderRadius: 8, padding: 16, alignItems: 'center', marginBottom: 16},
  submitButtonDisabled: {backgroundColor: '#9ca3af'},
  submitButtonText: {color: '#fff', fontSize: 16, fontWeight: '600'},
  backToLoginContainer: {alignItems: 'center', padding: 12},
  backToLoginText: {color: '#17236a', fontSize: 14, fontWeight: '500'},
  footer: {marginTop: 40, alignItems: 'center'},
  footerText: {color: '#6b7280', fontSize: 12},
  successContainer: {alignItems: 'center'},
  successIcon: {width: 80, height: 80, borderRadius: 40, backgroundColor: '#d1fae5', alignItems: 'center', justifyContent: 'center', marginBottom: 24},
  successIconText: {fontSize: 40, color: '#059669'},
  successTitle: {fontSize: 24, fontWeight: '600', color: '#1f2937', marginBottom: 16},
  successMessage: {fontSize: 16, color: '#374151', textAlign: 'center', marginBottom: 12, paddingHorizontal: 20},
  successNote: {fontSize: 14, color: '#6b7280', textAlign: 'center', marginBottom: 32, paddingHorizontal: 20},
  backButton: {backgroundColor: '#17236a', borderRadius: 8, padding: 16, alignItems: 'center', width: '100%'},
  backButtonText: {color: '#fff', fontSize: 16, fontWeight: '600'},
});
