const API = '/api';

function getToken() {
  return localStorage.getItem('token');
}

async function request(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  const token = getToken();
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  login: (email, password) => request('POST', '/auth/login', { email, password }),
  verify2fa: (temp_token, code) => request('POST', '/auth/verify-2fa', { temp_token, code }),
  seed: () => request('POST', '/seed'),

  getDashboard: () => request('GET', '/dashboard'),
  getJobs: (status) => request('GET', `/jobs${status ? `?status=${status}` : ''}`),
  getJob: (id) => request('GET', `/jobs/${id}`),
  createJob: (data) => request('POST', '/jobs', data),
  updateJob: (id, data) => request('PUT', `/jobs/${id}`, data),
  deleteJob: (id) => request('DELETE', `/jobs/${id}`),
  startTimer: (id) => request('POST', `/jobs/${id}/start-timer`),
  pauseTimer: (id) => request('POST', `/jobs/${id}/pause-timer`),
  completeWork: (id, data) => request('POST', `/jobs/${id}/complete-work`, data),
  clientSignoff: (id, data) => request('POST', `/jobs/${id}/client-signoff`, data),
  techSignoff: (id, data) => request('POST', `/jobs/${id}/tech-signoff`, data),
  getJobLogs: (id) => request('GET', `/jobs/${id}/logs`),

  getUsers: () => request('GET', '/users'),
  createUser: (data) => request('POST', '/users', data),
  updateUser: (id, data) => request('PUT', `/users/${id}`, data),
  deleteUser: (id) => request('DELETE', `/users/${id}`),
  setup2FA: (id) => request('POST', `/users/${id}/setup-2fa`),
  enable2FA: (id, code) => request('POST', `/users/${id}/enable-2fa`, { code }),
  disable2FA: (id) => request('POST', `/users/${id}/disable-2fa`),

  getCompanies: () => request('GET', '/companies'),
  getCompany: (id) => request('GET', `/companies/${id}`),
  createCompany: (data) => request('POST', '/companies', data),
  updateCompany: (id, data) => request('PUT', `/companies/${id}`, data),
  deleteCompany: (id) => request('DELETE', `/companies/${id}`),

  getNotifications: () => request('GET', '/notifications'),
  markNotificationRead: (id) => request('POST', `/notifications/${id}/read`),

  reportFault: (data) => request('POST', '/client/fault', data),
  getMyCompany: () => request('GET', '/client/my-company'),
};