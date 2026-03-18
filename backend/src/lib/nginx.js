const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const NGINX_CONF_DIR = '/etc/nginx/conf.d';
const NGINX_PATHS_DIR = '/etc/nginx/paths.d';
const NGINX_SSL_DIR = '/etc/nginx/ssl';

function generateServerBlock(domain, port, { enableSSL, forceHTTPS, redirectWWW, sslCertPath, sslKeyPath }) {
  let config = '';

  // HTTP server block
  config += `# HTTP SERVER\nserver {\n    listen 80;\n    server_name ${domain} www.${domain};\n\n`;
  if (enableSSL) {
    // Allow ACME / SSL verification over HTTP
    config += `    location ^~ /.well-known/ {\n        root /var/www;\n        allow all;\n    }\n\n`;
  }
  if (forceHTTPS && enableSSL) {
    config += `    location / {\n        return 301 https://${domain}$request_uri;\n    }\n`;
  } else {
    config += `    location / {\n        proxy_pass http://host.docker.internal:${port};\n        proxy_set_header Host $host;\n        proxy_set_header X-Forwarded-Proto $scheme;\n    }\n`;
  }
  config += `}\n\n`;

  // HTTPS server block (SSL termination at master nginx)
  if (enableSSL) {
    config += `# HTTPS SERVER\nserver {\n    listen 443 ssl;\n    http2 on;\n    server_name ${domain} www.${domain};\n\n`;
    config += `    ssl_certificate     ${sslCertPath || `/etc/nginx/ssl/${domain}.crt`};\n`;
    config += `    ssl_certificate_key ${sslKeyPath || `/etc/nginx/ssl/${domain}.key`};\n\n`;

    // Security headers
    config += `    add_header X-Frame-Options "SAMEORIGIN" always;\n`;
    config += `    add_header X-Content-Type-Options "nosniff" always;\n`;
    config += `    add_header X-XSS-Protection "1; mode=block" always;\n`;
    config += `    add_header Referrer-Policy "strict-origin-when-cross-origin" always;\n`;
    config += `    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;\n\n`;

    if (redirectWWW) {
      config += `    if ($host = www.${domain}) {\n        return 301 https://${domain}$request_uri;\n    }\n\n`;
    }

    config += `    location / {\n        proxy_pass http://host.docker.internal:${port};\n        proxy_set_header Host $host;\n        proxy_set_header X-Forwarded-Proto https;\n    }\n`;
    config += `}\n`;
  }

  return config;
}

function generateProjectConfig(project, domains) {
  let config = `# Docklet managed config for: ${project.name}\n# Auto-generated - do not edit manually\n\n`;

  for (const d of domains) {
    // Per-domain SSL: use domain's own cert if available, fallback to project-level
    const domainSSL = !!(d.ssl_cert_path && d.ssl_key_path);
    const hasSSL = domainSSL || !!project.enable_ssl;
    config += generateServerBlock(d.domain, project.port, {
      enableSSL: hasSSL,
      forceHTTPS: hasSSL && !!project.force_https,
      redirectWWW: !!project.redirect_www,
      sslCertPath: d.ssl_cert_path || project.ssl_cert_path,
      sslKeyPath: d.ssl_key_path || project.ssl_key_path,
    });
    config += '\n';
  }

  return config;
}

function generatePathConfig(project) {
  const bp = project.base_path.replace(/\/+$/, ''); // remove trailing slash
  let config = `# Docklet path-based config for: ${project.name}\n`;
  config += `# Auto-generated - do not edit manually\n\n`;
  config += `location ${bp}/ {\n`;
  config += `    proxy_pass http://host.docker.internal:${project.port}/;\n`;
  config += `    proxy_set_header Host $host;\n`;
  config += `    proxy_set_header X-Real-IP $remote_addr;\n`;
  config += `    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n`;
  config += `    proxy_set_header X-Forwarded-Proto $scheme;\n`;
  config += `}\n`;
  return config;
}

function writePathConfig(projectName, configContent) {
  if (!fs.existsSync(NGINX_PATHS_DIR)) {
    fs.mkdirSync(NGINX_PATHS_DIR, { recursive: true });
  }
  const confPath = path.join(NGINX_PATHS_DIR, `${projectName}.conf`);
  fs.writeFileSync(confPath, configContent);
  return confPath;
}

function removePathConfig(projectName) {
  const confPath = path.join(NGINX_PATHS_DIR, `${projectName}.conf`);
  if (fs.existsSync(confPath)) {
    fs.unlinkSync(confPath);
  }
}

function readPathConfig(projectName) {
  const confPath = path.join(NGINX_PATHS_DIR, `${projectName}.conf`);
  if (fs.existsSync(confPath)) {
    return fs.readFileSync(confPath, 'utf-8');
  }
  return null;
}

function readNginxConfig(projectName) {
  const confPath = path.join(NGINX_CONF_DIR, `${projectName}.conf`);
  if (fs.existsSync(confPath)) {
    return fs.readFileSync(confPath, 'utf-8');
  }
  return null;
}

function writeNginxConfig(projectName, configContent) {
  const confPath = path.join(NGINX_CONF_DIR, `${projectName}.conf`);
  fs.writeFileSync(confPath, configContent);
  return confPath;
}

function removeNginxConfig(projectName) {
  const confPath = path.join(NGINX_CONF_DIR, `${projectName}.conf`);
  if (fs.existsSync(confPath)) {
    fs.unlinkSync(confPath);
  }
}

const NGINX_CONTAINER = process.env.NGINX_CONTAINER_NAME || 'docklet-nginx';

function reloadNginx() {
  try {
    execSync(`docker exec ${NGINX_CONTAINER} nginx -t`, { stdio: 'pipe' });
    execSync(`docker exec ${NGINX_CONTAINER} nginx -s reload`, { stdio: 'pipe' });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.stderr ? err.stderr.toString() : err.message };
  }
}

function saveSSLFiles(domain, certContent, keyContent) {
  if (!fs.existsSync(NGINX_SSL_DIR)) {
    fs.mkdirSync(NGINX_SSL_DIR, { recursive: true });
  }
  const certPath = path.join(NGINX_SSL_DIR, `${domain}.crt`);
  const keyPath = path.join(NGINX_SSL_DIR, `${domain}.key`);
  fs.writeFileSync(certPath, certContent);
  fs.writeFileSync(keyPath, keyContent);
  return { certPath, keyPath };
}

module.exports = {
  generateProjectConfig,
  generatePathConfig,
  readNginxConfig,
  writeNginxConfig,
  removeNginxConfig,
  writePathConfig,
  removePathConfig,
  readPathConfig,
  reloadNginx,
  saveSSLFiles,
  NGINX_CONF_DIR,
  NGINX_PATHS_DIR,
  NGINX_SSL_DIR,
};
