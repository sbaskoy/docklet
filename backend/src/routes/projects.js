const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { cloneRepo, dockerComposeUp, dockerComposeDown, dockerComposeLogs, dockerComposePs, dockerComposeServices, dockerComposeServiceLogs, pullRepo, isPortInUse, APPS_DIR } = require('../lib/docker');
const { generateProjectConfig, generatePathConfig, readNginxConfig, writeNginxConfig, removeNginxConfig, writePathConfig, removePathConfig, readPathConfig, reloadNginx, saveSSLFiles } = require('../lib/nginx');

const router = express.Router();
router.use(authMiddleware);

const upload = multer({ dest: '/tmp/docklet-uploads/' });

function getNextPort() {
  const row = db.prepare('SELECT MAX(port) as maxPort FROM projects').get();
  const next = (row && row.maxPort) ? row.maxPort + 1 : 10000;
  if (isPortInUse(next)) {
    // find next available
    for (let p = next; p < next + 100; p++) {
      if (!isPortInUse(p)) return p;
    }
  }
  return next;
}

function getGithubToken() {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('github_token');
  return row ? row.value : null;
}

// List all projects
router.get('/', (req, res) => {
  const projects = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
  const result = projects.map(p => {
    const domains = db.prepare('SELECT * FROM domains WHERE project_id = ?').all(p.id);
    return { ...p, domains };
  });
  res.json(result);
});

// Get single project
router.get('/:id', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const domains = db.prepare('SELECT * FROM domains WHERE project_id = ?').all(project.id);
  res.json({ ...project, domains });
});

// Create and deploy project
router.post('/', upload.fields([
  { name: 'sslCert', maxCount: 1 },
  { name: 'sslKey', maxCount: 1 },
]), (req, res) => {
  try {
    const { name, repoUrl, branch, composePath, domains: domainsJson, envContent, enableSSL, forceHTTPS, redirectWWW, port: requestedPort, basePath } = req.body;

    // Validation
    if (!name || !repoUrl || !branch) {
      return res.status(400).json({ error: 'Name, repo URL, and branch are required' });
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      return res.status(400).json({ error: 'Project name must be alphanumeric (dashes/underscores allowed)' });
    }

    const existing = db.prepare('SELECT id FROM projects WHERE name = ?').get(name);
    if (existing) {
      return res.status(400).json({ error: 'Project name already exists' });
    }

    let domains = [];
    try {
      domains = JSON.parse(domainsJson || '[]').filter(d => d && d.trim());
    } catch {
      return res.status(400).json({ error: 'Invalid domains format' });
    }

    // Validate base_path
    let cleanBasePath = null;
    if (basePath && basePath.trim()) {
      cleanBasePath = basePath.trim().replace(/\/+$/, '');
      if (!cleanBasePath.startsWith('/')) cleanBasePath = '/' + cleanBasePath;
      if (!/^\/[a-zA-Z0-9_\-\/]+$/.test(cleanBasePath)) {
        return res.status(400).json({ error: 'Base path must contain only alphanumeric characters, dashes, underscores, and slashes' });
      }
      const pathConflict = db.prepare('SELECT name FROM projects WHERE base_path = ?').get(cleanBasePath);
      if (pathConflict) {
        return res.status(400).json({ error: `Path "${cleanBasePath}" is already used by project "${pathConflict.name}"` });
      }
    }

    if (!domains.length && !cleanBasePath) {
      return res.status(400).json({ error: 'At least one domain or a base path is required' });
    }

    // Check for domain conflicts
    for (const d of domains) {
      const conflict = db.prepare('SELECT d.domain, p.name FROM domains d JOIN projects p ON p.id = d.project_id WHERE d.domain = ?').get(d);
      if (conflict) {
        return res.status(400).json({ error: `Domain "${d}" is already used by project "${conflict.name}"` });
      }
    }

    // Manual port or auto-assign
    let port;
    if (requestedPort) {
      port = parseInt(requestedPort, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        return res.status(400).json({ error: 'Port must be a number between 1 and 65535' });
      }
      const portConflict = db.prepare('SELECT name FROM projects WHERE port = ?').get(port);
      if (portConflict) {
        return res.status(400).json({ error: `Port ${port} is already used by project "${portConflict.name}"` });
      }
      if (isPortInUse(port)) {
        return res.status(400).json({ error: `Port ${port} is already in use on the host` });
      }
    } else {
      port = getNextPort();
    }
    const ssl = enableSSL === 'true' || enableSSL === true;
    const fHttps = forceHTTPS === 'true' || forceHTTPS === true;
    const rWww = redirectWWW === 'true' || redirectWWW === true;

    // Handle SSL cert/key uploads
    let sslCertPath = null;
    let sslKeyPath = null;
    if (ssl && req.files) {
      if (req.files.sslCert && req.files.sslKey) {
        const certContent = fs.readFileSync(req.files.sslCert[0].path, 'utf-8');
        const keyContent = fs.readFileSync(req.files.sslKey[0].path, 'utf-8');
        // Save for first domain, symlink for others
        const primaryDomain = domains[0];
        const saved = saveSSLFiles(primaryDomain, certContent, keyContent);
        sslCertPath = saved.certPath;
        sslKeyPath = saved.keyPath;
        // Cleanup temp files
        fs.unlinkSync(req.files.sslCert[0].path);
        fs.unlinkSync(req.files.sslKey[0].path);
      }
    }

    // STEP 1: Clone repo
    const ghToken = getGithubToken();
    const cloneResult = cloneRepo(repoUrl, name, branch, ghToken);
    if (!cloneResult.success) {
      return res.status(500).json({ error: 'Failed to clone repository', details: cloneResult.error });
    }

    // STEP 2 & 3: Create .env file
    const projectDir = path.join(APPS_DIR, name);
    if (envContent) {
      fs.writeFileSync(path.join(projectDir, '.env'), envContent);
    }

    // Insert into DB
    const result = db.prepare(`
      INSERT INTO projects (name, repo_url, branch, compose_path, port, env_content, enable_ssl, force_https, redirect_www, ssl_cert_path, ssl_key_path, base_path, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'deploying')
    `).run(name, repoUrl, branch, composePath || 'docker-compose.yml', port, envContent || '', ssl ? 1 : 0, fHttps ? 1 : 0, rWww ? 1 : 0, sslCertPath, sslKeyPath, cleanBasePath);

    const projectId = result.lastInsertRowid;

    // Insert domains
    const insertDomain = db.prepare('INSERT INTO domains (project_id, domain) VALUES (?, ?)');
    for (const d of domains) {
      insertDomain.run(projectId, d);
    }

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    const domainRows = db.prepare('SELECT * FROM domains WHERE project_id = ?').all(projectId);

    // STEP 4: docker-compose up
    const composeResult = dockerComposeUp(name, composePath || 'docker-compose.yml');
    if (!composeResult.success) {
      db.prepare('UPDATE projects SET status = ? WHERE id = ?').run('error', projectId);
      return res.status(500).json({
        error: 'Failed to start containers',
        details: composeResult.error,
        project: { ...project, domains: domainRows },
      });
    }

    // STEP 7 & 8: Generate and write nginx config
    try {
      if (domainRows.length) {
        const nginxConfig = generateProjectConfig(project, domainRows);
        writeNginxConfig(name, nginxConfig);
      }
      if (project.base_path) {
        const pathConfig = generatePathConfig(project);
        writePathConfig(name, pathConfig);
      }
    } catch (err) {
      db.prepare('UPDATE projects SET status = ? WHERE id = ?').run('running', projectId);
      return res.json({
        warning: 'Containers running but nginx config failed',
        details: err.message,
        project: { ...project, domains: domainRows, status: 'running' },
      });
    }

    // STEP 9: Reload nginx
    const reloadResult = reloadNginx();
    if (!reloadResult.success) {
      // Rollback config
      removeNginxConfig(name);
      reloadNginx(); // reload with old config
      db.prepare('UPDATE projects SET status = ? WHERE id = ?').run('running', projectId);
      return res.json({
        warning: 'Containers running but nginx reload failed - config rolled back',
        details: reloadResult.error,
        project: { ...project, domains: domainRows, status: 'running' },
      });
    }

    db.prepare('UPDATE projects SET status = ? WHERE id = ?').run('running', projectId);
    res.json({ success: true, project: { ...project, domains: domainRows, status: 'running' } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stop project
router.post('/:id/stop', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const result = dockerComposeDown(project.name, project.compose_path);
  if (!result.success) {
    return res.status(500).json({ error: 'Failed to stop', details: result.error });
  }

  db.prepare('UPDATE projects SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('stopped', project.id);
  res.json({ success: true });
});

// Start/restart project
router.post('/:id/start', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const result = dockerComposeUp(project.name, project.compose_path);
  if (!result.success) {
    db.prepare('UPDATE projects SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('error', project.id);
    return res.status(500).json({ error: 'Failed to start', details: result.error });
  }

  db.prepare('UPDATE projects SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('running', project.id);
  res.json({ success: true });
});

// Pull latest from GitHub (git pull only, no rebuild)
router.post('/:id/pull', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const pullResult = pullRepo(project.name, project.branch);
  if (!pullResult.success) {
    return res.status(500).json({ error: 'Failed to pull from GitHub', details: pullResult.error });
  }

  // Re-write .env
  if (project.env_content) {
    const projectDir = path.join(APPS_DIR, project.name);
    fs.writeFileSync(path.join(projectDir, '.env'), project.env_content);
  }

  db.prepare('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(project.id);
  res.json({ success: true });
});

// Redeploy (pull + rebuild)
router.post('/:id/redeploy', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  db.prepare('UPDATE projects SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('deploying', project.id);

  const pullResult = pullRepo(project.name, project.branch);
  if (!pullResult.success) {
    db.prepare('UPDATE projects SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('error', project.id);
    return res.status(500).json({ error: 'Failed to pull', details: pullResult.error });
  }

  // Re-write .env
  if (project.env_content) {
    const projectDir = path.join(APPS_DIR, project.name);
    fs.writeFileSync(path.join(projectDir, '.env'), project.env_content);
  }

  const result = dockerComposeUp(project.name, project.compose_path);
  if (!result.success) {
    db.prepare('UPDATE projects SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('error', project.id);
    return res.status(500).json({ error: 'Failed to rebuild', details: result.error });
  }

  db.prepare('UPDATE projects SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('running', project.id);
  res.json({ success: true });
});

// Delete project
router.delete('/:id', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  // Stop containers
  dockerComposeDown(project.name, project.compose_path);

  // Remove project folder
  const projectDir = path.join(APPS_DIR, project.name);
  if (fs.existsSync(projectDir)) {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }

  // Remove nginx config and path config, then reload
  removeNginxConfig(project.name);
  removePathConfig(project.name);
  reloadNginx();

  // Remove from DB (cascades to domains)
  db.prepare('DELETE FROM projects WHERE id = ?').run(project.id);

  res.json({ success: true });
});

// Get logs (all or specific service)
router.get('/:id/logs', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const lines = parseInt(req.query.lines) || 200;
  const service = req.query.service;

  let result;
  if (service) {
    result = dockerComposeServiceLogs(project.name, project.compose_path, service, lines);
  } else {
    result = dockerComposeLogs(project.name, project.compose_path, lines);
  }
  if (!result.success) {
    return res.status(500).json({ error: 'Failed to get logs', details: result.error });
  }
  res.json({ logs: result.logs });
});

// Get container list (services)
router.get('/:id/containers', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const result = dockerComposeServices(project.name, project.compose_path);
  res.json({ services: result.services || [] });
});

// Get container status
router.get('/:id/status', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const result = dockerComposePs(project.name, project.compose_path);
  res.json({ status: project.status, containers: result.success ? result.output : null });
});

// Update project settings
router.put('/:id', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { name, branch, composePath, port, basePath } = req.body;

  // Validate name if changed
  if (name && name !== project.name) {
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      return res.status(400).json({ error: 'Project name must be alphanumeric (dashes/underscores allowed)' });
    }
    const existing = db.prepare('SELECT id FROM projects WHERE name = ? AND id != ?').get(name, project.id);
    if (existing) {
      return res.status(400).json({ error: 'Project name already exists' });
    }
  }

  // Validate port if changed
  if (port && parseInt(port) !== project.port) {
    const p = parseInt(port, 10);
    if (isNaN(p) || p < 1 || p > 65535) {
      return res.status(400).json({ error: 'Port must be between 1 and 65535' });
    }
    const portConflict = db.prepare('SELECT name FROM projects WHERE port = ? AND id != ?').get(p, project.id);
    if (portConflict) {
      return res.status(400).json({ error: `Port ${p} is already used by project "${portConflict.name}"` });
    }
  }

  // Validate base_path if provided
  let updatedBasePath = project.base_path;
  if (basePath !== undefined) {
    if (basePath && basePath.trim()) {
      updatedBasePath = basePath.trim().replace(/\/+$/, '');
      if (!updatedBasePath.startsWith('/')) updatedBasePath = '/' + updatedBasePath;
      if (!/^\/[a-zA-Z0-9_\-\/]+$/.test(updatedBasePath)) {
        return res.status(400).json({ error: 'Base path must contain only alphanumeric characters, dashes, underscores, and slashes' });
      }
      const pathConflict = db.prepare('SELECT name FROM projects WHERE base_path = ? AND id != ?').get(updatedBasePath, project.id);
      if (pathConflict) {
        return res.status(400).json({ error: `Path "${updatedBasePath}" is already used by project "${pathConflict.name}"` });
      }
    } else {
      updatedBasePath = null;
    }
  }

  const updatedName = name || project.name;
  const updatedBranch = branch || project.branch;
  const updatedComposePath = composePath || project.compose_path;
  const updatedPort = port ? parseInt(port, 10) : project.port;

  db.prepare(`
    UPDATE projects SET name = ?, branch = ?, compose_path = ?, port = ?, base_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(updatedName, updatedBranch, updatedComposePath, updatedPort, updatedBasePath, project.id);

  // Regenerate nginx configs if relevant fields changed
  const needsRegenerate = updatedPort !== project.port || updatedName !== project.name || updatedBasePath !== project.base_path;
  if (needsRegenerate) {
    const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(project.id);
    const domainRows = db.prepare('SELECT * FROM domains WHERE project_id = ?').all(project.id);

    // Remove old configs if name changed
    if (updatedName !== project.name) {
      removeNginxConfig(project.name);
      removePathConfig(project.name);
    }

    try {
      // Domain-based config
      if (domainRows.length) {
        const nginxConfig = generateProjectConfig(updated, domainRows);
        writeNginxConfig(updatedName, nginxConfig);
      }
      // Path-based config
      if (updated.base_path) {
        const pathConfig = generatePathConfig(updated);
        writePathConfig(updatedName, pathConfig);
      } else {
        removePathConfig(updatedName);
      }
      reloadNginx();
    } catch (err) {
      // non-fatal
    }
  }

  const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(project.id);
  const domains = db.prepare('SELECT * FROM domains WHERE project_id = ?').all(project.id);
  res.json({ success: true, project: { ...updated, domains } });
});

// Update .env
router.put('/:id/env', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { envContent } = req.body;
  db.prepare('UPDATE projects SET env_content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(envContent || '', project.id);

  const projectDir = path.join(APPS_DIR, project.name);
  if (fs.existsSync(projectDir)) {
    fs.writeFileSync(path.join(projectDir, '.env'), envContent || '');
  }

  res.json({ success: true });
});

// Update domains
router.put('/:id/domains', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { domains } = req.body;
  if (!domains || !domains.length) {
    return res.status(400).json({ error: 'At least one domain required' });
  }

  // Check conflicts (exclude current project)
  for (const d of domains) {
    const conflict = db.prepare('SELECT d.domain, p.name FROM domains d JOIN projects p ON p.id = d.project_id WHERE d.domain = ? AND d.project_id != ?').get(d, project.id);
    if (conflict) {
      return res.status(400).json({ error: `Domain "${d}" is already used by project "${conflict.name}"` });
    }
  }

  // Update domains
  db.prepare('DELETE FROM domains WHERE project_id = ?').run(project.id);
  const insertDomain = db.prepare('INSERT INTO domains (project_id, domain) VALUES (?, ?)');
  for (const d of domains) {
    insertDomain.run(project.id, d);
  }

  // Regenerate nginx config
  const domainRows = db.prepare('SELECT * FROM domains WHERE project_id = ?').all(project.id);
  const nginxConfig = generateProjectConfig(project, domainRows);

  try {
    writeNginxConfig(project.name, nginxConfig);
    const reloadResult = reloadNginx();
    if (!reloadResult.success) {
      return res.json({ warning: 'Domains updated but nginx reload failed', details: reloadResult.error });
    }
  } catch (err) {
    return res.json({ warning: 'Domains updated but nginx config failed', details: err.message });
  }

  db.prepare('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(project.id);
  res.json({ success: true, domains: domainRows });
});

// Update SSL settings (project-level: forceHTTPS, redirectWWW)
router.put('/:id/ssl', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { forceHTTPS, redirectWWW } = req.body;
  const fHttps = forceHTTPS === 'true' || forceHTTPS === true;
  const rWww = redirectWWW === 'true' || redirectWWW === true;

  db.prepare(`
    UPDATE projects SET force_https = ?, redirect_www = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(fHttps ? 1 : 0, rWww ? 1 : 0, project.id);

  // Regenerate nginx
  const updatedProject = db.prepare('SELECT * FROM projects WHERE id = ?').get(project.id);
  const domainRows = db.prepare('SELECT * FROM domains WHERE project_id = ?').all(project.id);
  const nginxConfig = generateProjectConfig(updatedProject, domainRows);

  try {
    writeNginxConfig(project.name, nginxConfig);
    const reloadResult = reloadNginx();
    if (!reloadResult.success) {
      return res.json({ warning: 'SSL updated but nginx reload failed', details: reloadResult.error });
    }
  } catch (err) {
    return res.json({ warning: 'SSL updated but nginx config failed', details: err.message });
  }

  res.json({ success: true });
});

// Upload SSL for a specific domain
router.put('/:id/domains/:domainId/ssl', upload.fields([
  { name: 'sslCert', maxCount: 1 },
  { name: 'sslKey', maxCount: 1 },
]), (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const domainRow = db.prepare('SELECT * FROM domains WHERE id = ? AND project_id = ?').get(req.params.domainId, project.id);
  if (!domainRow) return res.status(404).json({ error: 'Domain not found' });

  if (!req.files || !req.files.sslCert || !req.files.sslKey) {
    return res.status(400).json({ error: 'Both SSL certificate and key files are required' });
  }

  const certContent = fs.readFileSync(req.files.sslCert[0].path, 'utf-8');
  const keyContent = fs.readFileSync(req.files.sslKey[0].path, 'utf-8');
  const saved = saveSSLFiles(domainRow.domain, certContent, keyContent);

  fs.unlinkSync(req.files.sslCert[0].path);
  fs.unlinkSync(req.files.sslKey[0].path);

  db.prepare('UPDATE domains SET ssl_cert_path = ?, ssl_key_path = ? WHERE id = ?').run(saved.certPath, saved.keyPath, domainRow.id);

  // Regenerate nginx config
  const domainRows = db.prepare('SELECT * FROM domains WHERE project_id = ?').all(project.id);
  const nginxConfig = generateProjectConfig(project, domainRows);

  try {
    writeNginxConfig(project.name, nginxConfig);
    const reloadResult = reloadNginx();
    if (!reloadResult.success) {
      return res.json({ warning: 'SSL uploaded but nginx reload failed', details: reloadResult.error });
    }
  } catch (err) {
    return res.json({ warning: 'SSL uploaded but nginx config failed', details: err.message });
  }

  res.json({ success: true, domain: domainRow.domain });
});

// Remove SSL for a specific domain
router.delete('/:id/domains/:domainId/ssl', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const domainRow = db.prepare('SELECT * FROM domains WHERE id = ? AND project_id = ?').get(req.params.domainId, project.id);
  if (!domainRow) return res.status(404).json({ error: 'Domain not found' });

  db.prepare('UPDATE domains SET ssl_cert_path = NULL, ssl_key_path = NULL WHERE id = ?').run(domainRow.id);

  // Regenerate nginx config
  const domainRows = db.prepare('SELECT * FROM domains WHERE project_id = ?').all(project.id);
  const nginxConfig = generateProjectConfig(project, domainRows);

  try {
    writeNginxConfig(project.name, nginxConfig);
    reloadNginx();
  } catch { /* non-fatal */ }

  res.json({ success: true });
});

// Get nginx config (raw)
router.get('/:id/nginx-config', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const config = readNginxConfig(project.name);
  res.json({ config: config || '' });
});

// Save custom nginx config
router.put('/:id/nginx-config', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { config } = req.body;
  if (config === undefined || config === null) {
    return res.status(400).json({ error: 'Config content is required' });
  }

  try {
    writeNginxConfig(project.name, config);
    const reloadResult = reloadNginx();
    if (!reloadResult.success) {
      // Rollback: regenerate default config
      const domainRows = db.prepare('SELECT * FROM domains WHERE project_id = ?').all(project.id);
      const defaultConfig = generateProjectConfig(project, domainRows);
      writeNginxConfig(project.name, defaultConfig);
      reloadNginx();
      return res.status(400).json({ error: 'Invalid nginx config - rolled back to default', details: reloadResult.error });
    }
  } catch (err) {
    return res.status(500).json({ error: 'Failed to save nginx config', details: err.message });
  }

  res.json({ success: true });
});

// Reset nginx config to auto-generated default
router.post('/:id/nginx-config/reset', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const domainRows = db.prepare('SELECT * FROM domains WHERE project_id = ?').all(project.id);
  const config = generateProjectConfig(project, domainRows);

  try {
    writeNginxConfig(project.name, config);
    const reloadResult = reloadNginx();
    if (!reloadResult.success) {
      return res.json({ warning: 'Config reset but nginx reload failed', details: reloadResult.error });
    }
  } catch (err) {
    return res.status(500).json({ error: 'Failed to reset nginx config', details: err.message });
  }

  res.json({ success: true, config });
});

module.exports = router;
