import Constants from 'expo-constants';

/**
 * API URL Configuration
 * Handles different environments (dev, production) and platforms (Android, iOS)
 */
const getApiUrl = () => {
  // 1. Check environment variable from app.json extra config
  const envApiUrl = Constants.expoConfig?.extra?.apiUrl;
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

  // 3. Production fallback (configure this for production deployment)
  return 'https://your-production-api.com/api/auth';
};

export const API_URL = getApiUrl();

// Export debugging information
export const getDebugInfo = () => ({
  apiUrl: API_URL,
  platform: Constants.platform,
  isDev: __DEV__,
  extra: Constants.expoConfig?.extra,
});
