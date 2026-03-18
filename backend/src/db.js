const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(path.join(DB_DIR, 'docklet.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    repo_url TEXT NOT NULL,
    branch TEXT NOT NULL DEFAULT 'main',
    compose_path TEXT NOT NULL DEFAULT 'docker-compose.yml',
    port INTEGER NOT NULL,
    env_content TEXT DEFAULT '',
    enable_ssl INTEGER DEFAULT 0,
    force_https INTEGER DEFAULT 0,
    redirect_www INTEGER DEFAULT 0,
    ssl_cert_path TEXT,
    ssl_key_path TEXT,
    base_path TEXT,
    status TEXT DEFAULT 'stopped',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS domains (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    domain TEXT NOT NULL,
    ssl_cert_path TEXT,
    ssl_key_path TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_domains_domain ON domains(domain);
`);

// Migration: add ssl columns to domains if missing
try {
  db.prepare("SELECT ssl_cert_path FROM domains LIMIT 1").get();
} catch {
  db.exec("ALTER TABLE domains ADD COLUMN ssl_cert_path TEXT");
  db.exec("ALTER TABLE domains ADD COLUMN ssl_key_path TEXT");
}

// Migration: add base_path to projects if missing
try {
  db.prepare("SELECT base_path FROM projects LIMIT 1").get();
} catch {
  db.exec("ALTER TABLE projects ADD COLUMN base_path TEXT");
}

module.exports = db;
