const { execSync, exec } = require('child_process');
const path = require('path');

const APPS_DIR = '/apps';

// Auto-detect: docker compose (plugin) or docker-compose (standalone)
let COMPOSE_CMD = 'docker-compose';
try {
  execSync('docker compose version', { stdio: 'pipe' });
  COMPOSE_CMD = 'docker compose';
} catch {
  try {
    execSync('docker-compose version', { stdio: 'pipe' });
    COMPOSE_CMD = 'docker-compose';
  } catch {
    // fallback
  }
}

function dockerComposeUp(projectName, composePath) {
  const projectDir = path.join(APPS_DIR, projectName);
  const composeFile = path.resolve(projectDir, composePath);
  try {
    execSync(`${COMPOSE_CMD} -f "${composeFile}" up -d --build`, {
      cwd: projectDir,
      stdio: 'pipe',
      timeout: 300000, // 5 min
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.stderr ? err.stderr.toString() : err.message };
  }
}

function dockerComposeDown(projectName, composePath) {
  const projectDir = path.join(APPS_DIR, projectName);
  const composeFile = path.resolve(projectDir, composePath);
  try {
    execSync(`${COMPOSE_CMD} -f "${composeFile}" down`, {
      cwd: projectDir,
      stdio: 'pipe',
      timeout: 60000,
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.stderr ? err.stderr.toString() : err.message };
  }
}

function dockerComposeLogs(projectName, composePath, lines = 100) {
  const projectDir = path.join(APPS_DIR, projectName);
  const composeFile = path.resolve(projectDir, composePath);
  try {
    const output = execSync(`${COMPOSE_CMD} -f "${composeFile}" logs --tail=${lines}`, {
      cwd: projectDir,
      stdio: 'pipe',
      timeout: 15000,
    });
    return { success: true, logs: output.toString() };
  } catch (err) {
    return { success: false, error: err.stderr ? err.stderr.toString() : err.message };
  }
}

function dockerComposePs(projectName, composePath) {
  const projectDir = path.join(APPS_DIR, projectName);
  const composeFile = path.resolve(projectDir, composePath);
  try {
    const output = execSync(`${COMPOSE_CMD} -f "${composeFile}" ps`, {
      cwd: projectDir,
      stdio: 'pipe',
      timeout: 15000,
    });
    return { success: true, output: output.toString() };
  } catch (err) {
    return { success: false, error: err.stderr ? err.stderr.toString() : err.message };
  }
}

function cloneRepo(repoUrl, projectName, branch, githubToken) {
  const projectDir = path.join(APPS_DIR, projectName);
  let cloneUrl = repoUrl;
  if (githubToken && repoUrl.startsWith('https://')) {
    cloneUrl = repoUrl.replace('https://', `https://${githubToken}@`);
  }
  try {
    execSync(`git clone --branch "${branch}" --single-branch "${cloneUrl}" "${projectDir}"`, {
      stdio: 'pipe',
      timeout: 120000,
    });
    return { success: true, path: projectDir };
  } catch (err) {
    return { success: false, error: err.stderr ? err.stderr.toString() : err.message };
  }
}

function pullRepo(projectName, branch) {
  const projectDir = path.join(APPS_DIR, projectName);
  try {
    execSync(`git -C "${projectDir}" pull origin "${branch}"`, {
      stdio: 'pipe',
      timeout: 60000,
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.stderr ? err.stderr.toString() : err.message };
  }
}

function dockerComposeServices(projectName, composePath) {
  const projectDir = path.join(APPS_DIR, projectName);
  const composeFile = path.resolve(projectDir, composePath);
  try {
    const output = execSync(`${COMPOSE_CMD} -f "${composeFile}" ps --format json`, {
      cwd: projectDir,
      stdio: 'pipe',
      timeout: 15000,
    });
    const raw = output.toString().trim();
    if (!raw) return { success: true, services: [] };
    // docker compose ps --format json outputs one JSON object per line
    const services = raw.split('\n').filter(Boolean).map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
    return { success: true, services };
  } catch (err) {
    return { success: false, error: err.stderr ? err.stderr.toString() : err.message, services: [] };
  }
}

function dockerComposeServiceLogs(projectName, composePath, serviceName, lines = 200) {
  const projectDir = path.join(APPS_DIR, projectName);
  const composeFile = path.resolve(projectDir, composePath);
  try {
    const output = execSync(`${COMPOSE_CMD} -f "${composeFile}" logs --tail=${lines} "${serviceName}"`, {
      cwd: projectDir,
      stdio: 'pipe',
      timeout: 15000,
    });
    return { success: true, logs: output.toString() };
  } catch (err) {
    return { success: false, error: err.stderr ? err.stderr.toString() : err.message };
  }
}

function isPortInUse(port) {
  try {
    // Check if any container is using this port on the host
    const output = execSync(`docker ps --format '{{.Ports}}' 2>/dev/null`, { stdio: 'pipe' }).toString();
    return output.includes(`:${port}->`);
  } catch {
    return false;
  }
}

module.exports = {
  dockerComposeUp,
  dockerComposeDown,
  dockerComposeLogs,
  dockerComposePs,
  dockerComposeServices,
  dockerComposeServiceLogs,
  cloneRepo,
  pullRepo,
  isPortInUse,
  APPS_DIR,
};
