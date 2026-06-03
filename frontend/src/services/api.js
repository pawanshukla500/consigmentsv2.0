import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  me: () => api.get('/auth/me')
};

// Consignments API
export const consignmentsAPI = {
  getAll: (params) => api.get('/consignments', { params }),
  getById: (id) => api.get(`/consignments/${id}`),
  create: (data) => api.post('/consignments', data),
  update: (id, data) => api.put(`/consignments/${id}`, data),
  delete: (id) => api.delete(`/consignments/${id}`),
  packSku: (consignmentId, skuId, data) => api.post(`/consignments/${consignmentId}/skus/${skuId}/pack`, data),
  saveBox: (consignmentId, data) => api.post(`/consignments/${consignmentId}/boxes`, data)
};

// Uploads API
export const uploadsAPI = {
  upload: (formData) => api.post('/uploads', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  getFiles: (consignmentId, type) => api.get(`/uploads/${consignmentId}`, { params: { type } }),
  delete: (fileId, type) => api.delete(`/uploads/${fileId}`, { params: { type } })
};

// Marketplaces API
export const marketplacesAPI = {
  getAll: () => api.get('/marketplaces'),
  create: (data) => api.post('/marketplaces', data),
  update: (id, data) => api.put(`/marketplaces/${id}`, data),
  delete: (id) => api.delete(`/marketplaces/${id}`)
};

// Docket Companies API
export const docketCompaniesAPI = {
  getAll: () => api.get('/docket-companies'),
  create: (data) => api.post('/docket-companies', data),
  update: (id, data) => api.put(`/docket-companies/${id}`, data),
  delete: (id) => api.delete(`/docket-companies/${id}`)
};

// Packing API
export const packingAPI = {
  load: (data) => api.post('/packing/load', data),
  increment: (data) => api.post('/packing/increment', data),
  decrement: (data) => api.post('/packing/decrement', data),
  checkDuplicateBox: (data) => api.post('/packing/check-duplicate-box', data),
  saveBox: (data) => api.post('/packing/save-box', data),
  generateLabel: (data) => api.post('/packing/generate-label', data),
  finish: (data) => api.post('/packing/finish', data),
  resumeSession: () => api.get('/packing/resume-session'),
  syncStatus: () => api.get('/packing/sync-status'),
  getProductivity: () => api.get('/packing/productivity'),
  uploadVideo: (data) => api.post('/packing/upload-video', data)
};

// Templates API
export const templatesAPI = {
  downloadConsignment: () => api.get('/templates/consignment', { responseType: 'blob' })
};

// Productivity API
export const productivityAPI = {
  log: (data) => api.post('/productivity', data),
  getStats: (params) => api.get('/productivity', { params }),
  getAuditLogs: (params) => api.get('/productivity/audit', { params })
};

// Users API
export const usersAPI = {
  getAll: () => api.get('/users'),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
  changePassword: (id, data) => api.post(`/users/${id}/change-password`, data)
};

// Audit Logs API
export const auditLogsAPI = {
  getAll: (params) => api.get('/audit-logs', { params }),
  getMyActivity: () => api.get('/audit-logs/my-activity')
};

// Settings API
export const settingsAPI = {
  get: () => api.get('/settings'),
  update: (data) => api.put('/settings', data),
  runCleanup: () => api.post('/settings/cleanup')
};

// Email API (MailerSend — all from consignment@youthnic.shop)
export const emailAPI = {
  send:               (data) => api.post('/email/send', data),
  sendWelcome:        (data) => api.post('/email/welcome', data),
  notifyConsignment:  (data) => api.post('/email/notify-consignment', data),
  resolveAddress:     (name) => api.get('/email/resolve-address', { params: { name } })
};

export default api;
