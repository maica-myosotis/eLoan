/**
 * Application Service
 * Handles loan application API calls
 */

import apiService from './apiService';

/**
 * Simple in-memory TTL cache for data that rarely changes (loan types, required documents).
 * Avoids redundant network calls when the user navigates back/forward through the wizard.
 */
const _cache = new Map();

function getCached(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    _cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data, ttlMs) {
  _cache.set(key, { data, expiry: Date.now() + ttlMs });
}

const FIVE_MIN = 5 * 60 * 1000;
const TEN_MIN  = 10 * 60 * 1000;

class ApplicationService {
  /**
   * Check if user can apply for a new loan
   */
  async checkCanApply() {
    const response = await apiService.get('/applicant/can-apply/');
    return response.data;
  }

  /**
   * Get all active loan types (cached 5 min — loan types change rarely)
   */
  async getLoanTypes() {
    const cached = getCached('loan_types');
    if (cached) return cached;
    const response = await apiService.get('/applicant/loan-types/');
    const data = response.data.loan_types;
    setCache('loan_types', data, FIVE_MIN);
    return data;
  }

  /**
   * Get loan type details including co-maker requirements (cached 5 min)
   */
  async getLoanTypeDetail(loanTypeId) {
    const key = `loan_type_${loanTypeId}`;
    const cached = getCached(key);
    if (cached) return cached;
    const response = await apiService.get(`/applicant/loan-types/${loanTypeId}/`);
    setCache(key, response.data, FIVE_MIN);
    return response.data;
  }

  /**
   * Get required documents checklist for a loan type (cached 10 min — almost never changes)
   */
  async getRequiredDocuments(loanTypeId) {
    const key = `required_docs_${loanTypeId}`;
    const cached = getCached(key);
    if (cached) return cached;
    const response = await apiService.get(`/applicant/loan-types/${loanTypeId}/required-documents/`);
    const data = response.data.documents;
    setCache(key, data, TEN_MIN);
    return data;
  }

  /**
   * Create a new draft application
   */
  async createApplication(loanTypeId) {
    const response = await apiService.post('/applicant/applications/create/', {
      loan_type_id: loanTypeId,
    });
    return response.data;
  }

  /**
   * Get user's applications
   */
  async getApplications(statusFilter = null) {
    const params = statusFilter ? { status: statusFilter } : {};
    const response = await apiService.get('/applicant/applications/', { params });
    return response.data.applications;
  }

  /**
   * Get application detail
   */
  async getApplication(applicationId) {
    const response = await apiService.get(`/applicant/applications/${applicationId}/`);
    return response.data;
  }

  /**
   * Update application step data
   */
  async updateStep(applicationId, stepNumber, data) {
    const response = await apiService.put(
      `/applicant/applications/${applicationId}/step/${stepNumber}/`,
      data
    );
    return response.data;
  }

  /**
   * Calculate amortization
   */
  async calculateAmortization(loanTypeId, amount, termMonths) {
    const response = await apiService.post('/applicant/calculate-amortization/', {
      loan_type_id: loanTypeId,
      amount: amount,
      term_months: termMonths,
    });
    return response.data;
  }

  /**
   * Upload document
   */
  async uploadDocument(applicationId, documentType, fileUri) {
    const formData = new FormData();
    formData.append('document_type', documentType);

    // Get file extension
    const ext = fileUri.split('.').pop().toLowerCase();
    const mimeType = ext === 'pdf' ? 'application/pdf' : `image/${ext}`;

    formData.append('file', {
      uri: fileUri,
      type: mimeType,
      name: `${documentType}_${Date.now()}.${ext}`,
    });

    const response = await apiService.post(
      `/applicant/applications/${applicationId}/documents/upload/`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      }
    );
    return response.data;
  }

  /**
   * Get application documents
   */
  async getDocuments(applicationId) {
    const response = await apiService.get(`/applicant/applications/${applicationId}/documents/`);
    return response.data;
  }

  /**
   * Delete a document
   */
  async deleteDocument(documentId) {
    const response = await apiService.delete(`/applicant/documents/${documentId}/`);
    return response.data;
  }

  /**
   * Upload face capture
   */
  async uploadFaceCapture(applicationId, imageUri) {
    const formData = new FormData();
    const filename = `face_${Date.now()}.jpg`;
    formData.append('image', {
      uri: imageUri,
      type: 'image/jpeg',
      name: filename,
    });

    try {
      const response = await apiService.post(
        `/applicant/applications/${applicationId}/face-capture/`,
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 180000, // 3 minutes — DeepFace/TensorFlow model loading can be slow
        }
      );
      return response.data;
    } catch (error) {
      console.error('[FaceCapture] Failed:', error?.message, '| status:', error?.response?.status);
      throw error;
    }
  }

  /**
   * Perform liveness check (legacy - for image-based liveness)
   */
  async performLivenessCheck(applicationId, imageUri, method) {
    const formData = new FormData();
    formData.append('image', {
      uri: imageUri,
      type: 'image/jpeg',
      name: `liveness_${Date.now()}.jpg`,
    });
    formData.append('method', method);

    const response = await apiService.post(
      `/applicant/applications/${applicationId}/liveness-check/`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      }
    );
    return response.data;
  }

  /**
   * Upload liveness video for verification
   */
  async uploadLivenessVideo(applicationId, videoUri) {
    if (!videoUri) {
      throw new Error('videoUri is required for liveness video upload');
    }

    const filename = `liveness_${Date.now()}.mp4`;
    const formData = new FormData();
    formData.append('video', {
      uri: videoUri,
      type: 'video/mp4',
      name: filename,
    });

    try {
      const response = await apiService.post(
        `/applicant/applications/${applicationId}/liveness-video/`,
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 60000, // 60 second timeout for video upload
        }
      );
      return response.data;
    } catch (error) {
      const isTimeout = error?.code === 'ECONNABORTED';
      console.error('[LivenessVideo] Failed:', error?.message, '| timeout:', isTimeout, '| status:', error?.response?.status);
      throw error;
    }
  }

  /**
   * Get verification status
   */
  async getVerificationStatus(applicationId) {
    const response = await apiService.get(
      `/applicant/applications/${applicationId}/verification-status/`
    );
    return response.data;
  }

  /**
   * Submit application for review
   */
  async submitApplication(applicationId) {
    const response = await apiService.post(
      `/applicant/applications/${applicationId}/submit/`
    );
    return response.data;
  }

  /**
   * Withdraw application
   */
  async withdrawApplication(applicationId, reason = '') {
    const response = await apiService.post(
      `/applicant/applications/${applicationId}/withdraw/`,
      { reason }
    );
    return response.data;
  }

  /**
   * Delete a draft application
   */
  async deleteDraftApplication(applicationId) {
    const response = await apiService.post(
      `/applicant/applications/${applicationId}/delete/`
    );
    return response.data;
  }

  /**
   * Search users for co-maker
   */
  async searchUsers(query) {
    const response = await apiService.get('/applicant/search-users/', {
      params: { q: query },
    });
    return response.data.users;
  }

  /**
   * Get application co-makers
   */
  async getCoMakers(applicationId) {
    const response = await apiService.get(`/applicant/applications/${applicationId}/comakers/`);
    return response.data;
  }

  /**
   * Add co-maker to application
   */
  async addCoMaker(applicationId, comakerUserId, comakerInfo) {
    const response = await apiService.post(
      `/applicant/applications/${applicationId}/comakers/`,
      {
        comaker_user_id: comakerUserId,
        comaker_info: comakerInfo,
      }
    );
    return response.data;
  }

  /**
   * Update co-maker information
   */
  async updateCoMaker(comakerId, comakerInfo) {
    const response = await apiService.put(
      `/applicant/comakers/${comakerId}/`,
      comakerInfo
    );
    return response.data;
  }

  /**
   * Remove co-maker from application
   */
  async removeCoMaker(comakerId) {
    const response = await apiService.delete(`/applicant/comakers/${comakerId}/`);
    return response.data;
  }

  async getLoanSchedule(applicationId) {
    const response = await apiService.get(`/applicant/applications/${applicationId}/schedule/`);
    return response.data;
  }
}

export default new ApplicationService();
