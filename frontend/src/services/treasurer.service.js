import axios from 'axios';
import authService from './auth.service';

const API_URL = import.meta.env.VITE_API_URL?.replace('/auth', '/treasurer') || 'http://localhost:8000/api/treasurer';

const getAuthHeaders = () => {
  const token = authService.getAccessToken();
  return {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    }
  };
};

const handleError = (error) => {
  if (error.response?.status === 401) {
    authService.logout();
    window.location.href = '/';
  }
  throw error;
};

class TreasurerService {
  // =========================================================================
  // Dashboard
  // =========================================================================
  async getDashboard() {
    try {
      const response = await axios.get(`${API_URL}/dashboard/`, getAuthHeaders());
      return response.data;
    } catch (error) {
      handleError(error);
    }
  }

  // =========================================================================
  // Forwarded Applications
  // =========================================================================
  async getForwardedApplications() {
    try {
      const response = await axios.get(`${API_URL}/applications/forwarded/`, getAuthHeaders());
      return response.data;
    } catch (error) {
      handleError(error);
    }
  }

  async getApplication(id) {
    try {
      const response = await axios.get(`${API_URL}/applications/${id}/`, getAuthHeaders());
      return response.data;
    } catch (error) {
      handleError(error);
    }
  }

  async evaluateApplication(id, netSalary, recommendation, remarks = '') {
    try {
      const response = await axios.post(
        `${API_URL}/applications/${id}/evaluate/`,
        { net_salary: netSalary, recommendation, remarks },
        getAuthHeaders()
      );
      return response.data;
    } catch (error) {
      handleError(error);
    }
  }

  // =========================================================================
  // Loans & Payments
  // =========================================================================
  async getDisbursedLoans() {
    try {
      const response = await axios.get(`${API_URL}/loans/disbursed/`, getAuthHeaders());
      return response.data;
    } catch (error) {
      handleError(error);
    }
  }

  async getPaymentHistory(loanId) {
    try {
      const response = await axios.get(`${API_URL}/loans/${loanId}/payments/`, getAuthHeaders());
      return response.data;
    } catch (error) {
      handleError(error);
    }
  }

  async recordPayment(loanId, amount, paymentMethod, remarks = '') {
    try {
      const response = await axios.post(
        `${API_URL}/loans/${loanId}/payments/add/`,
        { amount, payment_method: paymentMethod, remarks },
        getAuthHeaders()
      );
      return response.data;
    } catch (error) {
      handleError(error);
    }
  }

  async releaseFunds(loanId, remarks = '') {
    try {
      const response = await axios.post(
        `${API_URL}/loans/${loanId}/release/`,
        { remarks },
        getAuthHeaders()
      );
      return response.data;
    } catch (error) {
      handleError(error);
    }
  }

  async getApprovedForDisbursement() {
    try {
      // Re-use the active loans report which returns all Active/Disbursed loans.
      // We also need "Approved – For Disbursement" ones — fetch from monitoring
      // and filter client-side since no dedicated endpoint exists yet.
      const response = await axios.get(`${API_URL}/loans/monitoring/`, getAuthHeaders());
      const all = response.data.loans || [];
      return {
        loans: all.filter(l => l.status === 'Approved \u2013 For Disbursement'),
      };
    } catch (error) {
      handleError(error);
    }
  }

  // =========================================================================
  // Loan Monitoring
  // =========================================================================
  async getLoansForMonitoring() {
    try {
      const response = await axios.get(`${API_URL}/loans/monitoring/`, getAuthHeaders());
      return response.data;
    } catch (error) {
      handleError(error);
    }
  }

  // =========================================================================
  // Reports
  // =========================================================================
  async getReport(type, filters = {}) {
    try {
      const params = new URLSearchParams({ type, ...filters });
      const response = await axios.get(`${API_URL}/reports/?${params}`, getAuthHeaders());
      return response.data;
    } catch (error) {
      handleError(error);
    }
  }

  // =========================================================================
  // Notifications
  // =========================================================================
  async getNotifications() {
    try {
      const response = await axios.get(`${API_URL}/notifications/`, getAuthHeaders());
      return response.data;
    } catch (error) {
      handleError(error);
    }
  }

  async getUnreadCount() {
    try {
      const response = await axios.get(`${API_URL}/notifications/unread-count/`, getAuthHeaders());
      return response.data;
    } catch (error) {
      handleError(error);
    }
  }

  async markNotificationRead(id) {
    try {
      const response = await axios.post(`${API_URL}/notifications/${id}/read/`, {}, getAuthHeaders());
      return response.data;
    } catch (error) {
      handleError(error);
    }
  }

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

  // =========================================================================
  // Settings
  // =========================================================================
  async getProfile() {
    try {
      const response = await axios.get(`${API_URL}/settings/profile/`, getAuthHeaders());
      return response.data;
    } catch (error) {
      handleError(error);
    }
  }

  async updateProfile(profileData) {
    try {
      const response = await axios.put(`${API_URL}/settings/profile/`, profileData, getAuthHeaders());
      return response.data;
    } catch (error) {
      handleError(error);
    }
  }

  async uploadProfilePicture(file) {
    try {
      const token = authService.getAccessToken();
      const formData = new FormData();
      formData.append('profile_picture', file);

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

  async removeProfilePicture() {
    try {
      const response = await axios.delete(`${API_URL}/settings/profile/picture/`, getAuthHeaders());
      return response.data;
    } catch (error) {
      handleError(error);
    }
  }

  async changePassword(oldPassword, newPassword, confirmPassword) {
    try {
      const response = await axios.post(
        `${API_URL}/settings/change-password/`,
        { old_password: oldPassword, new_password: newPassword, confirm_password: confirmPassword },
        getAuthHeaders()
      );
      return response.data;
    } catch (error) {
      handleError(error);
    }
  }

  async getNotificationPreferences() {
    try {
      const response = await axios.get(`${API_URL}/settings/notification-preferences/`, getAuthHeaders());
      return response.data;
    } catch (error) {
      handleError(error);
    }
  }

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

  async logoutEverywhere() {
    try {
      const response = await axios.post(`${API_URL}/settings/logout-everywhere/`, {}, getAuthHeaders());
      return response.data;
    } catch (error) {
      handleError(error);
    }
  }
}

export default new TreasurerService();
