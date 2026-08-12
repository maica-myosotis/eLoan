import axios from 'axios';
import authService from './auth.service';

const API_URL = import.meta.env.VITE_API_URL?.replace('/auth', '/superadmin') || 'http://localhost:8000/api/superadmin';

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

class SuperAdminService {
  // ── Stats ────────────────────────────────────────────────────────────────
  async getStats() {
    try {
      const res = await axios.get(`${API_URL}/stats/`, getAuthHeaders());
      return res.data;
    } catch (e) { handleError(e); }
  }

  // ── Staff ─────────────────────────────────────────────────────────────────
  async getStaff(params = {}) {
    try {
      const res = await axios.get(`${API_URL}/staff/`, { ...getAuthHeaders(), params });
      return res.data;
    } catch (e) { handleError(e); }
  }

  async staffAction(userId, action, payload = {}) {
    try {
      const res = await axios.post(`${API_URL}/staff/${userId}/${action}/`, payload, getAuthHeaders());
      return res.data;
    } catch (e) { handleError(e); }
  }

  // ── Members ───────────────────────────────────────────────────────────────
  async getMembers(params = {}) {
    try {
      const res = await axios.get(`${API_URL}/members/`, { ...getAuthHeaders(), params });
      return res.data;
    } catch (e) { handleError(e); }
  }

  async getMemberFaceVerifications(memberId) {
    try {
      const res = await axios.get(`${API_URL}/members/${memberId}/face-verifications/`, getAuthHeaders());
      return res.data;
    } catch (e) { handleError(e); }
  }

  async getMemberCaseHistory(memberId) {
    try {
      const res = await axios.get(`${API_URL}/members/${memberId}/case-history/`, getAuthHeaders());
      return res.data;
    } catch (e) { handleError(e); }
  }

  async terminateMember(memberId, payload) {
    try {
      const res = await axios.post(`${API_URL}/members/${memberId}/terminate/`, payload, getAuthHeaders());
      return res.data;
    } catch (e) { handleError(e); }
  }

  // ── Violations ────────────────────────────────────────────────────────────
  async getViolations(params = {}) {
    try {
      const res = await axios.get(`${API_URL}/violations/`, { ...getAuthHeaders(), params });
      return res.data;
    } catch (e) { handleError(e); }
  }

  async createViolation(payload) {
    try {
      const res = await axios.post(`${API_URL}/violations/`, payload, getAuthHeaders());
      return res.data;
    } catch (e) { handleError(e); }
  }

  async updateViolation(id, payload) {
    try {
      const res = await axios.patch(`${API_URL}/violations/${id}/`, payload, getAuthHeaders());
      return res.data;
    } catch (e) { handleError(e); }
  }

  // ── Disciplinary Actions ──────────────────────────────────────────────────
  async getDisciplinaryActions(params = {}) {
    try {
      const res = await axios.get(`${API_URL}/disciplinary-actions/`, { ...getAuthHeaders(), params });
      return res.data;
    } catch (e) { handleError(e); }
  }

  async createDisciplinaryAction(payload) {
    try {
      const res = await axios.post(`${API_URL}/disciplinary-actions/`, payload, getAuthHeaders());
      return res.data;
    } catch (e) { handleError(e); }
  }

  // ── Notifications ─────────────────────────────────────────────────────────
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

  async getUnreadCount() {
    try {
      const res = await axios.get(`${API_URL}/notifications/unread-count/`, getAuthHeaders());
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
}

export default new SuperAdminService();
