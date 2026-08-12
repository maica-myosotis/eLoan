import Constants from 'expo-constants';

/**
 * API URL Configuration
 * Handles different environments (dev, production) and platforms (Android, iOS)
 */
const getApiUrl = () => {
  // 1. Check environment variables / Expo extra config
  const envApiUrl = process.env.EXPO_PUBLIC_API_URL || Constants.expoConfig?.extra?.apiUrl;
  if (envApiUrl) {
    return envApiUrl;
  }

  // 2. Platform-specific defaults for local development
  // Android emulator uses 10.0.2.2 to access host machine's localhost
  // iOS simulator can use localhost directly
  const isAndroid = Constants.platform?.android;

  if (__DEV__) {
    // 10.0.2.2 is the standard Android emulator address for the host machine's localhost.
    // For physical device testing, set apiUrl in app.json extra config instead.
    return isAndroid
      ? 'http://10.0.2.2:8000/api/auth'
      : 'http://localhost:8000/api/auth';
  }

  throw new Error('Missing API URL. Set EXPO_PUBLIC_API_URL or expo.extra.apiUrl.');
};

export const API_URL = getApiUrl();

// Export debugging information
export const getDebugInfo = () => ({
  apiUrl: API_URL,
  platform: Constants.platform,
  isDev: __DEV__,
  extra: Constants.expoConfig?.extra,
});
