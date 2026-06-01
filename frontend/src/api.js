const API = '/api';

function getToken() {
  return localStorage.getItem('token');
}

async function request(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
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

  getTechnicians: () => request('GET', '/technicians'),
  createTechnician: (data) => request('POST', '/technicians', data),
  updateTechnician: (id, data) => request('PUT', `/technicians/${id}`, data),
  deleteTechnician: (id) => request('DELETE', `/technicians/${id}`),
  setup2FA: (id) => request('POST', `/technicians/${id}/setup-2fa`),
  enable2FA: (id, code) => request('POST', `/technicians/${id}/enable-2fa`, { code }),
  disable2FA: (id) => request('POST', `/technicians/${id}/disable-2fa`),

  getClients: () => request('GET', '/clients'),
  getClient: (id) => request('GET', `/clients/${id}`),
  createClient: (data) => request('POST', '/clients', data),
  updateClient: (id, data) => request('PUT', `/clients/${id}`, data),
  deleteClient: (id) => request('DELETE', `/clients/${id}`),
};