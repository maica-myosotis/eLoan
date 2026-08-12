import axios from 'axios';
import authService from './auth.service';

const API_URL = import.meta.env.VITE_API_URL?.replace('/auth', '/amo') || 'http://localhost:8000/api/amo';

const getAuthHeaders = () => {
  const token = authService.getAccessToken();
  return {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
};

const handleError = (error) => {
  if (error.response?.status === 401) {
    authService.logout();
    window.location.href = '/';
  }
  throw error;
};

class AMOService {
  // Dashboard
  async getDashboard() {
    try {
      const res = await axios.get(`${API_URL}/dashboard/`, getAuthHeaders());
      return res.data;
    } catch (e) { handleError(e); }
  }

  // Applications
  async getApplications(filterStatus = 'pending') {
    try {
      const res = await axios.get(`${API_URL}/applications/?status=${filterStatus}`, getAuthHeaders());
      return res.data;
    } catch (e) { handleError(e); }
  }

  async getApplicationDetail(id) {
    try {
      const res = await axios.get(`${API_URL}/applications/${id}/`, getAuthHeaders());
      return res.data;
    } catch (e) { handleError(e); }
  }

  async approveApplication(id) {
    try {
      const res = await axios.post(`${API_URL}/applications/${id}/approve/`, {}, getAuthHeaders());
      return res.data;
    } catch (e) { handleError(e); }
  }

  async rejectApplication(id, reason) {
    try {
      const res = await axios.post(`${API_URL}/applications/${id}/reject/`, { reason }, getAuthHeaders());
      return res.data;
    } catch (e) { handleError(e); }
  }

  // Members
  async getMembers(search = '') {
    try {
      const res = await axios.get(`${API_URL}/members/?search=${encodeURIComponent(search)}`, getAuthHeaders());
      return res.data;
    } catch (e) { handleError(e); }
  }

  async getMemberDetail(id) {
    try {
      const res = await axios.get(`${API_URL}/members/${id}/`, getAuthHeaders());
      return res.data;
    } catch (e) { handleError(e); }
  }

  async setMemberStatus(id, status) {
    try {
      const res = await axios.post(`${API_URL}/members/${id}/status/`, { status }, getAuthHeaders());
      return res.data;
    } catch (e) { handleError(e); }
  }

  // Savings
  async getMemberSavings(memberId) {
    try {
      const res = await axios.get(`${API_URL}/members/${memberId}/savings/`, getAuthHeaders());
      return res.data;
    } catch (e) { handleError(e); }
  }

  async addSavings(memberId, data) {
    try {
      const res = await axios.post(`${API_URL}/members/${memberId}/savings/`, data, getAuthHeaders());
      return res.data;
    } catch (e) { handleError(e); }
  }

  // Capital
  async getMemberCapital(memberId) {
    try {
      const res = await axios.get(`${API_URL}/members/${memberId}/capital/`, getAuthHeaders());
      return res.data;
    } catch (e) { handleError(e); }
  }

  async addCapital(memberId, data) {
    try {
      const res = await axios.post(`${API_URL}/members/${memberId}/capital/`, data, getAuthHeaders());
      return res.data;
    } catch (e) { handleError(e); }
  }

  // Reports
  async getReports() {
    try {
      const res = await axios.get(`${API_URL}/reports/`, getAuthHeaders());
      return res.data;
    } catch (e) { handleError(e); }
  }

  // Activity Logs
  async getActivityLogs(search = '') {
    try {
      const res = await axios.get(`${API_URL}/activity-logs/?search=${encodeURIComponent(search)}`, getAuthHeaders());
      return res.data;
    } catch (e) { handleError(e); }
  }

  // Notifications
  async getNotifications() {
    try {
      const res = await axios.get(`${API_URL}/notifications/`, getAuthHeaders());
      return res.data;
    } catch (e) { handleError(e); }
  }

  async markNotificationRead(id) {
    try {
      const res = await axios.post(`${API_URL}/notifications/${id}/read/`, {}, getAuthHeaders());
      return res.data;
    } catch (e) { handleError(e); }
  }

  async markAllNotificationsRead() {
    try {
      const res = await axios.post(`${API_URL}/notifications/mark-all-read/`, {}, getAuthHeaders());
      return res.data;
    } catch (e) { handleError(e); }
  }

  async deleteNotification(id) {
    try {
      const res = await axios.post(`${API_URL}/notifications/${id}/delete/`, {}, getAuthHeaders());
      return res.data;
    } catch (e) { handleError(e); }
  }

  async archiveNotification(id) {
    try {
      const res = await axios.post(`${API_URL}/notifications/${id}/archive/`, {}, getAuthHeaders());
      return res.data;
    } catch (e) { handleError(e); }
  }

  async getUnreadCount() {
    try {
      const res = await axios.get(`${API_URL}/notifications/unread-count/`, getAuthHeaders());
      return res.data;
    } catch (e) { handleError(e); }
  }

  // Settings
  async getProfile() {
    try {
      const res = await axios.get(`${API_URL}/settings/profile/`, getAuthHeaders());
      return res.data;
    } catch (e) { handleError(e); }
  }

  async updateProfile(data) {
    try {
      const res = await axios.put(`${API_URL}/settings/profile/`, data, getAuthHeaders());
      return res.data;
    } catch (e) { handleError(e); }
  }

  async changePassword(data) {
    try {
      const res = await axios.post(`${API_URL}/settings/change-password/`, data, getAuthHeaders());
      return res.data;
    } catch (e) { handleError(e); }
  }
}

export default new AMOService();
