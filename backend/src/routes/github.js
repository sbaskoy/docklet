const express = require('express');
const fetch = require('node-fetch');
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// Save GitHub token
router.post('/token', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });

  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('github_token', token);
  res.json({ success: true });
});

// Get GitHub token status
router.get('/token', (req, res) => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('github_token');
  res.json({ hasToken: !!row, token: row ? row.value.slice(0, 8) + '...' : null });
});

// Delete GitHub token
router.delete('/token', (req, res) => {
  db.prepare('DELETE FROM settings WHERE key = ?').run('github_token');
  res.json({ success: true });
});

function getToken() {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('github_token');
  return row ? row.value : null;
}

// List repos
router.get('/repos', async (req, res) => {
  const token = getToken();
  if (!token) return res.status(400).json({ error: 'GitHub token not configured' });

  try {
    const page = req.query.page || 1;
    const response = await fetch(`https://api.github.com/user/repos?per_page=50&page=${page}&sort=updated`, {
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
    });
    if (!response.ok) {
      const err = await response.json();
      const status = response.status === 401 ? 502 : response.status;
      return res.status(status).json({ error: response.status === 401 ? 'Invalid GitHub token' : (err.message || 'GitHub API error') });
    }
    const repos = await response.json();
    res.json(repos.map(r => ({
      id: r.id,
      name: r.name,
      full_name: r.full_name,
      clone_url: r.clone_url,
      private: r.private,
      default_branch: r.default_branch,
      updated_at: r.updated_at,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List branches for a repo
router.get('/repos/:owner/:repo/branches', async (req, res) => {
  const token = getToken();
  if (!token) return res.status(400).json({ error: 'GitHub token not configured' });

  try {
    const { owner, repo } = req.params;
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`, {
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
    });
    if (!response.ok) {
      const err = await response.json();
      const status = response.status === 401 ? 502 : response.status;
      return res.status(status).json({ error: response.status === 401 ? 'Invalid GitHub token' : (err.message || 'GitHub API error') });
    }
    const branches = await response.json();
    res.json(branches.map(b => ({ name: b.name })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
