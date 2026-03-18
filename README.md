# Docklet

A self-hosted mini deployment platform. Deploy Docker-based projects from GitHub with automatic nginx reverse proxy, SSL support, and domain management — all from a clean web UI.

## Architecture

```
Internet → Master Nginx (Docker) → Project Nginx (Docker) → App containers
```

- **Master nginx** (Docker container): handles domain routing, SSL termination, redirects
- **Project nginx** (inside project docker-compose): handles internal app routing
- **Backend** (Docker container): Node.js (Express) + SQLite
- **Frontend**: React + Tailwind CSS (built into backend image)
- Everything runs via a single `docker compose up`

## Prerequisites

- Linux server (Ubuntu/Debian recommended)
- Docker & Docker Compose v2
- Git

## Quick Setup

```bash
# 1. Clone this repo
git clone <your-repo-url> /opt/docklet
cd /opt/docklet

# 2. Copy and edit environment variables
cp .env.example .env
# Edit .env and set a strong JWT_SECRET

# 3. Start everything
docker compose up -d --build
```

That's it. Open `http://your-server` in a browser.

## Environment Variables

| Variable     | Default                    | Description          |
| ------------ | -------------------------- | -------------------- |
| `PORT`       | `3001`                     | Backend server port  |
| `JWT_SECRET` | `docklet-secret-change-me` | JWT signing secret   |

## First Run

1. Open `http://your-server` in a browser (port 80)
2. You'll be prompted to create an admin account
3. Go to **Settings** and add your GitHub Personal Access Token
4. Create your first project from the **New Project** page

## Features

### Dashboard
- List all deployed projects
- See status (running/stopped/error), ports, domains
- Quick actions: start, stop, redeploy, delete

### GitHub Integration
- Add personal access token
- Browse repositories
- Select branch

### Project Deployment
- Select repo + branch
- Set project name and docker-compose path
- Add multiple domains
- Paste raw `.env` content
- Configure SSL (upload cert/key, force HTTPS, redirect www)
- Automatic port assignment (starting from 10000)

### Project Management
- Start / Stop / Redeploy
- View container logs
- Edit environment variables
- Manage domains (auto-regenerates nginx config)
- Update SSL settings

### Nginx Config
Auto-generated per project with:
- HTTP to HTTPS redirect (optional)
- www to non-www redirect (optional)
- SSL termination with custom certificates
- Reverse proxy to assigned port

## Folder Structure

```
docklet/
├── docker-compose.yml     # Main compose file - runs everything
├── Dockerfile             # Multi-stage: builds frontend + backend
├── .env.example           # Environment variables template
├── nginx/
│   ├── nginx.conf         # Master nginx configuration
│   └── proxy_params       # Shared proxy headers
├── backend/
│   ├── Dockerfile          # Standalone backend image (dev)
│   ├── src/
│   │   ├── index.js        # Express entry point
│   │   ├── db.js           # SQLite schema & connection
│   │   ├── middleware/
│   │   │   └── auth.js     # JWT auth middleware
│   │   ├── lib/
│   │   │   ├── docker.js   # Docker/Git CLI operations
│   │   │   └── nginx.js    # Nginx config generator
│   │   └── routes/
│   │       ├── auth.js     # Setup + login
│   │       ├── github.js   # GitHub API proxy
│   │       └── projects.js # CRUD + deployment
│   └── package.json
├── frontend/
│   ├── Dockerfile          # Standalone frontend build (dev)
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx
│   │   ├── api.js          # API client
│   │   ├── components/
│   │   │   └── Layout.jsx
│   │   └── pages/
│   │       ├── SetupPage.jsx
│   │       ├── LoginPage.jsx
│   │       ├── DashboardPage.jsx
│   │       ├── NewProjectPage.jsx
│   │       ├── ProjectDetailPage.jsx
│   │       └── SettingsPage.jsx
│   ├── package.json
│   └── vite.config.js
└── README.md
```

## Docker Services

| Service     | Container Name    | Description                              |
| ----------- | ----------------- | ---------------------------------------- |
| `backend`   | `docklet-backend` | Node.js API + serves frontend static     |
| `nginx`     | `docklet-nginx`   | Master reverse proxy (port 80/443)       |

## Docker Volumes

| Volume       | Path in Container    | Description                    |
| ------------ | -------------------- | ------------------------------ |
| `backend_data` | `/app/data`        | SQLite database                |
| `apps_data`    | `/apps`            | Cloned project repositories    |
| `nginx_conf`   | `/etc/nginx/conf.d`| Auto-generated nginx configs   |
| `nginx_ssl`    | `/etc/nginx/ssl`   | SSL certificates               |

## Common Commands

```bash
# Start
docker compose up -d --build

# View logs
docker compose logs -f

# Rebuild after code changes
docker compose up -d --build

# Stop
docker compose down

# Stop and remove volumes (DELETES ALL DATA)
docker compose down -v
```

## Security Notes

- Passwords are hashed with bcrypt (12 rounds)
- JWT tokens expire after 24 hours
- GitHub tokens are stored in SQLite (consider encryption for production)
- All API routes (except auth) require valid JWT
- File uploads are validated and cleaned up
- Project names are sanitized (alphanumeric + dashes/underscores only)

## License

MIT
