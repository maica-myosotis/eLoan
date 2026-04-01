import axios from 'axios';
import authService from './auth.service';

const API_URL = import.meta.env.VITE_API_URL?.replace('/auth', '/bookkeeper') || 'http://localhost:8000/api/bookkeeper';

/**
 * Create axios instance with JWT auth header
 */
const getAuthHeaders = () => {
  const token = authService.getAccessToken();
  return {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    }
  };
};

/**
 * Handle API errors
 */
const handleError = (error) => {
  if (error.response?.status === 401) {
    // Token expired - redirect to login
    authService.logout();
    window.location.href = '/';
  }
  throw error;
};

class BookkeeperService {
  /**
   * Get dashboard data
   * @returns {Promise} Dashboard stats, recent applications, recent activity
   */
  async getDashboard() {
    try {
      const response = await axios.get(`${API_URL}/dashboard/`, getAuthHeaders());
      return response.data;
    } catch (error) {
      handleError(error);
    }
  }

  /**
   * Get list of submitted applications
   * @returns {Promise} List of applications
   */
  async getApplications() {
    try {
      const response = await axios.get(`${API_URL}/applications/`, getAuthHeaders());
      return response.data;
    } catch (error) {
      handleError(error);
    }
  }

  /**
   * Get single application details
   * @param {number} id - Application ID
   * @returns {Promise} Application details
   */
  async getApplication(id) {
    try {
      const response = await axios.get(`${API_URL}/applications/${id}/`, getAuthHeaders());
      return response.data;
    } catch (error) {
      handleError(error);
    }
  }

  /**
   * Verify (approve) an application
   * @param {number} id - Application ID
   * @param {string} notes - Optional notes
   * @returns {Promise}
   */
  async verifyApplication(id, notes = '') {
    try {
      const response = await axios.post(
        `${API_URL}/applications/${id}/verify/`,
        { notes },
        getAuthHeaders()
      );
      return response.data;
    } catch (error) {
      handleError(error);
    }
  }

  /**
   * Reject an application
   * @param {number} id - Application ID
   * @param {string} rejectionReason - Required reason
   * @param {string} notes - Optional notes
   * @returns {Promise}
   */
  async rejectApplication(id, rejectionReason, notes = '') {
    try {
      const response = await axios.post(
        `${API_URL}/applications/${id}/reject/`,
        { rejection_reason: rejectionReason, notes },
        getAuthHeaders()
      );
      return response.data;
    } catch (error) {
      handleError(error);
    }
  }

  async getActiveLoans() {
    try {
      const response = await axios.get(`${API_URL}/loans/active/`, getAuthHeaders());
      return response.data;
    } catch (error) {
      handleError(error);
    }
  }

  async recordDisbursement(loanId, notes = '') {
    try {
      const response = await axios.post(
        `${API_URL}/loans/${loanId}/record-disbursement/`,
        { notes },
        getAuthHeaders()
      );
      return response.data;
    } catch (error) {
      handleError(error);
    }
  }

  async confirmPayment(paymentId, notes = '') {
    try {
      const response = await axios.post(
        `${API_URL}/payments/${paymentId}/confirm/`,
        { notes },
        getAuthHeaders()
      );
      return response.data;
    } catch (error) {
      handleError(error);
    }
  }

  async getUnconfirmedPayments() {
    try {
      const response = await axios.get(`${API_URL}/payments/unconfirmed/`, getAuthHeaders());
      return response.data;
    } catch (error) {
      handleError(error);
    }
  }

  /**
   * Get reports data
   * @returns {Promise} Various report data
   */
  async getReports() {
    try {
      const response = await axios.get(`${API_URL}/reports/`, getAuthHeaders());
      return response.data;
    } catch (error) {
      handleError(error);
    }
  }

  /**
   * Get all notifications
   * @returns {Promise} List of notifications
   */
  async getNotifications() {
    try {
      const response = await axios.get(`${API_URL}/notifications/`, getAuthHeaders());
      return response.data;
    } catch (error) {
      handleError(error);
    }
  }

  /**
   * Get unread notification count
   * @returns {Promise} Unread count
   */
  async getUnreadCount() {
    try {
      const response = await axios.get(`${API_URL}/notifications/unread-count/`, getAuthHeaders());
      return response.data;
    } catch (error) {
      handleError(error);
    }
  }

  /**
   * Mark a notification as read
   * @param {number} id - Notification ID
   * @returns {Promise}
   */
  async markNotificationRead(id) {
    try {
      const response = await axios.post(
        `${API_URL}/notifications/${id}/read/`,
        {},
        getAuthHeaders()
      );
      return response.data;
    } catch (error) {
      handleError(error);
    }
  }

  /**
   * Mark all notifications as read
   * @returns {Promise}
   */
  async markAllNotificationsRead() {
    try {
      const response = await axios.post(`${API_URL}/notifications/mark-all-read/`, {}, getAuthHeaders());
      return response.data;
    } catch (error) {
      handleError(error);
    }
  }

  async deleteNotification(id) {
    try {
      const response = await axios.post(`${API_URL}/notifications/${id}/delete/`, {}, getAuthHeaders());
      return response.data;
    } catch (error) {
      handleError(error);
    }
  }

  async archiveNotification(id) {
    try {
      const response = await axios.post(`${API_URL}/notifications/${id}/archive/`, {}, getAuthHeaders());
      return response.data;
    } catch (error) {
      handleError(error);
    }
  }

  // ===========================================================================
  // Settings
  // ===========================================================================

  /**
   * Get user profile
   * @returns {Promise} User profile data
   */
  async getProfile() {
    try {
      const response = await axios.get(`${API_URL}/settings/profile/`, getAuthHeaders());
      return response.data;
    } catch (error) {
      handleError(error);
    }
  }

  /**
   * Update user profile
   * @param {Object} profileData - Profile data to update
   * @returns {Promise}
   */
  async updateProfile(profileData) {
    try {
      const response = await axios.put(
        `${API_URL}/settings/profile/`,
        profileData,
        getAuthHeaders()
      );
      return response.data;
    } catch (error) {
      handleError(error);
    }
  }

  /**
   * Upload profile picture
   * @param {File} file - Image file
   * @returns {Promise}
   */
  async uploadProfilePicture(file) {
    try {
      const formData = new FormData();
      formData.append('profile_picture', file);

      const token = authService.getAccessToken();
      const response = await axios.post(
        `${API_URL}/settings/profile/picture/`,
        formData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          }
        }
      );
      return response.data;
    } catch (error) {
      handleError(error);
    }
  }

  /**
   * Remove profile picture
   * @returns {Promise}
   */
  async removeProfilePicture() {
    try {
      const response = await axios.delete(
        `${API_URL}/settings/profile/picture/`,
        getAuthHeaders()
      );
      return response.data;
    } catch (error) {
      handleError(error);
    }
  }

  /**
   * Change password
   * @param {string} oldPassword - Current password
   * @param {string} newPassword - New password
   * @param {string} confirmPassword - Confirm new password
   * @returns {Promise}
   */
  async changePassword(oldPassword, newPassword, confirmPassword) {
    try {
      const response = await axios.post(
        `${API_URL}/settings/change-password/`,
        {
          old_password: oldPassword,
          new_password: newPassword,
          confirm_password: confirmPassword,
        },
        getAuthHeaders()
      );
      return response.data;
    } catch (error) {
      handleError(error);
    }
  }

  /**
   * Get notification preferences
   * @returns {Promise} Notification preferences
   */
  async getNotificationPreferences() {
    try {
      const response = await axios.get(
        `${API_URL}/settings/notification-preferences/`,
        getAuthHeaders()
      );
      return response.data;
    } catch (error) {
      handleError(error);
    }
  }

  /**
   * Update notification preferences
   * @param {Object} preferences - Preference toggles
   * @returns {Promise}
   */
  async updateNotificationPreferences(preferences) {
    try {
      const response = await axios.put(
        `${API_URL}/settings/notification-preferences/`,
        preferences,
        getAuthHeaders()
      );
      return response.data;
    } catch (error) {
      handleError(error);
    }
  }

  /**
   * Deactivate account
   * @param {string} password - Current password for verification
   * @returns {Promise}
   */
  async deactivateAccount(password) {
    try {
      const response = await axios.post(
        `${API_URL}/settings/deactivate-account/`,
        { password },
        getAuthHeaders()
      );
      return response.data;
    } catch (error) {
      handleError(error);
    }
  }

  /**
   * Logout from all devices
   * @returns {Promise}
   */
  async logoutEverywhere() {
    try {
      const response = await axios.post(
        `${API_URL}/settings/logout-everywhere/`,
        {},
        getAuthHeaders()
      );
      return response.data;
    } catch (error) {
      handleError(error);
    }
  }
}

export default new BookkeeperService();
