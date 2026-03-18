const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('docklet_token');
}

function setToken(token) {
  localStorage.setItem('docklet_token', token);
}

function clearToken() {
  localStorage.removeItem('docklet_token');
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearToken();
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed');
    err.details = data.details || null;
    throw err;
  }
  return data;
}

export const api = {
  // Auth
  getAuthStatus: () => request('/auth/status'),
  setup: (username, password) => request('/auth/setup', { method: 'POST', body: JSON.stringify({ username, password }) }),
  login: (username, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  getMe: () => request('/auth/me'),

  // GitHub
  getGithubToken: () => request('/github/token'),
  setGithubToken: (token) => request('/github/token', { method: 'POST', body: JSON.stringify({ token }) }),
  deleteGithubToken: () => request('/github/token', { method: 'DELETE' }),
  getRepos: (page = 1) => request(`/github/repos?page=${page}`),
  getBranches: (owner, repo) => request(`/github/repos/${owner}/${repo}/branches`),

  // Projects
  getProjects: () => request('/projects'),
  getProject: (id) => request(`/projects/${id}`),
  createProject: (formData) => {
    const token = getToken();
    return fetch(`${API_BASE}/projects`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) {
        const err = new Error(data.error || 'Request failed');
        err.details = data.details || null;
        throw err;
      }
      return data;
    });
  },
  stopProject: (id) => request(`/projects/${id}/stop`, { method: 'POST' }),
  startProject: (id) => request(`/projects/${id}/start`, { method: 'POST' }),
  pullProject: (id) => request(`/projects/${id}/pull`, { method: 'POST' }),
  redeployProject: (id) => request(`/projects/${id}/redeploy`, { method: 'POST' }),
  deleteProject: (id) => request(`/projects/${id}`, { method: 'DELETE' }),
  getProjectLogs: (id, lines = 200, service = '') => request(`/projects/${id}/logs?lines=${lines}${service ? `&service=${service}` : ''}`),
  getProjectContainers: (id) => request(`/projects/${id}/containers`),
  getProjectStatus: (id) => request(`/projects/${id}/status`),
  updateProject: (id, data) => request(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateEnv: (id, envContent) => request(`/projects/${id}/env`, { method: 'PUT', body: JSON.stringify({ envContent }) }),
  updateDomains: (id, domains) => request(`/projects/${id}/domains`, { method: 'PUT', body: JSON.stringify({ domains }) }),
  updateSSL: (id, data) => request(`/projects/${id}/ssl`, { method: 'PUT', body: JSON.stringify(data) }),
  uploadDomainSSL: (id, domainId, formData) => {
    const token = getToken();
    return fetch(`${API_BASE}/projects/${id}/domains/${domainId}/ssl`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) {
        const err = new Error(data.error || 'Request failed');
        err.details = data.details || null;
        throw err;
      }
      return data;
    });
  },
  removeDomainSSL: (id, domainId) => request(`/projects/${id}/domains/${domainId}/ssl`, { method: 'DELETE' }),
  getNginxConfig: (id) => request(`/projects/${id}/nginx-config`),
  saveNginxConfig: (id, config) => request(`/projects/${id}/nginx-config`, { method: 'PUT', body: JSON.stringify({ config }) }),
  resetNginxConfig: (id) => request(`/projects/${id}/nginx-config/reset`, { method: 'POST' }),

  setToken,
  getToken,
  clearToken,
};
