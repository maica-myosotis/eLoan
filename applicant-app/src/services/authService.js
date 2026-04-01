import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { API_URL } from '../config/api.config';
import { setCachedToken, clearCachedToken } from './apiService';

const REQUEST_TIMEOUT_MS = 30000;

/**
 * Authentication service for applicant mobile app
 * Handles login, logout, password reset, and token management
 */
class AuthService {
  /**
   * Login applicant user
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Promise<Object>} { success: boolean, user?: Object, error?: string }
   */
  async login(email, password) {
    try {
      const response = await axios.post(
        `${API_URL}/applicant/login/`,
        { email, password },
        { timeout: REQUEST_TIMEOUT_MS }
      );

      if (response.data.tokens) {
        const { access, refresh } = response.data.tokens;
        // Write all three entries in parallel — 3x faster than sequential awaits
        await Promise.all([
          SecureStore.setItemAsync('accessToken', access),
          SecureStore.setItemAsync('refreshToken', refresh),
          SecureStore.setItemAsync('user', JSON.stringify(response.data.user)),
        ]);
        // Warm up in-memory token cache so first API call after login skips SecureStore read
        setCachedToken(access);

        return { success: true, user: response.data.user };
      }

      return { success: false, error: 'Invalid response from server' };
    } catch (error) {
      // Transform error for consistent error handling
      const errorMessage = error.response?.data?.error ||
        'Unable to connect to server. Please check your internet connection.';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Register new applicant
   * @param {Object} data - Registration data
   * @param {string} data.employeeId - Employee ID
   * @param {string} data.firstname - First name
   * @param {string} data.lastname - Last name
   * @param {string} data.email - Email address
   * @param {string} data.password - Password
   * @param {string} data.confirmPassword - Password confirmation
   * @returns {Promise<Object>} { success: boolean, message?: string, error?: string }
   */
  async register(employeeId, firstname, lastname, email, password, confirmPassword) {
    try {
      const response = await axios.post(
        `${API_URL}/register/`,
        {
          employee_id: employeeId,
          firstname,
          lastname,
          email,
          password,
          confirm_password: confirmPassword,
        },
        { timeout: REQUEST_TIMEOUT_MS }
      );

      if (response.data.user) {
        return {
          success: true,
          message: response.data.message,
          user: response.data.user,
        };
      }

      return { success: false, error: 'Invalid response from server' };
    } catch (error) {
      // Handle validation errors from the server
      if (error.response?.data) {
        const errors = error.response.data;

        // Check for specific field errors
        if (errors.email) {
          return { success: false, error: Array.isArray(errors.email) ? errors.email[0] : errors.email };
        }
        if (errors.employee_id) {
          return { success: false, error: Array.isArray(errors.employee_id) ? errors.employee_id[0] : errors.employee_id };
        }
        if (errors.confirm_password) {
          return { success: false, error: Array.isArray(errors.confirm_password) ? errors.confirm_password[0] : errors.confirm_password };
        }
        if (errors.password) {
          return { success: false, error: Array.isArray(errors.password) ? errors.password[0] : errors.password };
        }
        if (errors.error) {
          return { success: false, error: errors.error };
        }
      }

      return {
        success: false,
        error: 'Unable to register. Please check your internet connection.',
      };
    }
  }

  /**
   * Register new applicant with full profile data (multipart/form-data)
   * @param {FormData} formData - All registration fields + file uploads
   * @returns {Promise<Object>} { success: boolean, message?: string, error?: string }
   */
  async registerFull(formData) {
    try {
      const response = await axios.post(
        `${API_URL}/register/`,
        formData,
        { timeout: 60000 }
      );
      if (response.data.user) {
        return { success: true, message: response.data.message, user: response.data.user };
      }
      return { success: false, error: 'Invalid response from server' };
    } catch (error) {
      console.error('[registerFull] error:', error?.message, '| code:', error?.code, '| status:', error?.response?.status);
      console.error('[registerFull] response data:', JSON.stringify(error?.response?.data));
      if (error.response?.data) {
        const errors = error.response.data;
        const firstKey = Object.keys(errors)[0];
        if (firstKey) {
          const msg = errors[firstKey];
          return { success: false, error: Array.isArray(msg) ? msg[0] : String(msg) };
        }
      }
      return { success: false, error: 'Unable to register. Please check your internet connection.' };
    }
  }

  /**
   * Logout user (clear stored tokens)
   */
  async logout() {
    try {
      clearCachedToken();
      await Promise.all([
        SecureStore.deleteItemAsync('accessToken'),
        SecureStore.deleteItemAsync('refreshToken'),
        SecureStore.deleteItemAsync('user'),
      ]);
    } catch (error) {
      console.error('Logout error:', error);
      // Continue even if deletion fails
    }
  }

  /**
   * Request password reset
   * @param {string} email - User email
   * @returns {Promise<Object>} Response message
   */
  async forgotPassword(email) {
    try {
      const response = await axios.post(
        `${API_URL}/forgot-password/`,
        { email },
        { timeout: REQUEST_TIMEOUT_MS }
      );
      return response.data;
    } catch (error) {
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      }
      throw new Error('Unable to send password reset email.');
    }
  }

  /**
   * Validate password reset token
   * @param {string} uid - User ID (base64 encoded)
   * @param {string} token - Reset token
   * @returns {Promise<Object>} Validation result with user info
   */
  async validateToken(uid, token) {
    try {
      const response = await axios.post(
        `${API_URL}/validate-token/`,
        { uid, token },
        { timeout: REQUEST_TIMEOUT_MS }
      );
      return response.data;
    } catch (error) {
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }
      throw new Error('Invalid or expired reset link.');
    }
  }

  /**
   * Set new password
   * @param {string} uid - User ID (base64 encoded)
   * @param {string} token - Reset token
   * @param {string} newPassword - New password
   * @param {string} confirmPassword - Password confirmation
   * @returns {Promise<Object>} Success message
   */
  async setPassword(uid, token, newPassword, confirmPassword) {
    try {
      const response = await axios.post(
        `${API_URL}/set-password/`,
        {
          uid,
          token,
          new_password: newPassword,
          confirm_password: confirmPassword,
        },
        { timeout: REQUEST_TIMEOUT_MS }
      );
      return response.data;
    } catch (error) {
      if (error.response?.data) {
        // Handle validation errors
        const errors = error.response.data;
        if (errors.confirm_password) {
          throw new Error(errors.confirm_password);
        }
        if (errors.new_password) {
          throw new Error(errors.new_password);
        }
      }
      throw new Error('Failed to set password. Please try again.');
    }
  }

  /**
   * Refresh access token
   * @returns {Promise<boolean>} True if refresh successful, false otherwise
   */
  async refreshToken() {
    try {
      const refreshToken = await SecureStore.getItemAsync('refreshToken');

      if (!refreshToken) {
        return false;
      }

      const response = await axios.post(
        `${API_URL}/token/refresh/`,
        { refresh: refreshToken },
        { timeout: REQUEST_TIMEOUT_MS }
      );

      if (response.data.access) {
        await SecureStore.setItemAsync('accessToken', response.data.access);
        setCachedToken(response.data.access);
        return true;
      }

      return false;
    } catch (error) {
      // If refresh fails, user needs to log in again
      console.error('Token refresh error:', error);
      return false;
    }
  }

  /**
   * Get current user from secure storage
   * @returns {Promise<Object|null>} User object or null
   */
  async getCurrentUser() {
    try {
      const userStr = await SecureStore.getItemAsync('user');
      if (userStr) {
        return JSON.parse(userStr);
      }
      return null;
    } catch (error) {
      console.error('Error getting current user:', error);
      return null;
    }
  }

  /**
   * Get access token
   * @returns {Promise<string|null>} Access token or null
   */
  async getAccessToken() {
    try {
      return await SecureStore.getItemAsync('accessToken');
    } catch (error) {
      console.error('Error getting access token:', error);
      return null;
    }
  }

  /**
   * Alias for getAccessToken (used by AuthContext)
   * @returns {Promise<string|null>} Access token or null
   */
  async getToken() {
    return this.getAccessToken();
  }

  /**
   * Get user data from storage (alias for getCurrentUser)
   * @returns {Promise<Object|null>} User data or null
   */
  async getUserData() {
    return this.getCurrentUser();
  }

  /**
   * Check if the current token is still valid
   * @returns {Promise<boolean>} True if token is valid
   */
  async isTokenValid() {
    try {
      const token = await this.getAccessToken();
      if (!token) return false;

      // Decode JWT to check expiration (without verification)
      const parts = token.split('.');
      if (parts.length !== 3) return false;

      const payload = JSON.parse(atob(parts[1]));
      const exp = payload.exp;

      if (!exp) return false;

      // Check if token expires in more than 60 seconds
      const now = Math.floor(Date.now() / 1000);
      return exp > now + 60;
    } catch (error) {
      console.error('Token validation error:', error);
      return false;
    }
  }

  /**
   * Check if user is authenticated
   * @returns {Promise<boolean>} Authentication status
   */
  async isAuthenticated() {
    const token = await this.getAccessToken();
    return !!token;
  }

  /**
   * Login / register applicant via Google OAuth.
   * Sends the Google access token to the backend which verifies it
   * and checks that the email ends with buksu.edu.ph.
   *
   * @param {string} googleAccessToken - Access token from expo-auth-session Google provider
   * @returns {Promise<Object>} { success, user?, error?, isPending?, isNew? }
   */
  async googleLogin(googleAccessToken) {
    try {
      const response = await axios.post(
        `${API_URL}/google/`,
        { access_token: googleAccessToken },
        { timeout: REQUEST_TIMEOUT_MS }
      );

      const data = response.data;

      // New account created — pending approval
      if (response.status === 201 && data.account_status === 'pending') {
        return {
          success: false,
          isPending: true,
          isNew: true,
          message: data.message,
        };
      }

      // Existing active user — tokens returned
      if (data.tokens) {
        const { access, refresh } = data.tokens;
        await Promise.all([
          SecureStore.setItemAsync('accessToken', access),
          SecureStore.setItemAsync('refreshToken', refresh),
          SecureStore.setItemAsync('user', JSON.stringify(data.user)),
        ]);
        setCachedToken(access);
        return { success: true, user: data.user, isNew: data.is_new };
      }

      return { success: false, error: 'Unexpected response from server.' };
    } catch (error) {
      const errData = error.response?.data;

      // Pending account
      if (errData?.account_status === 'pending') {
        return {
          success: false,
          isPending: true,
          message: errData.error,
        };
      }

      const errorMessage =
        errData?.error ||
        'Google sign-in failed. Please try again.';
      return { success: false, error: errorMessage };
    }
  }
}

export default new AuthService();
