require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const githubRoutes = require('./routes/github');
const projectRoutes = require('./routes/projects');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploaded SSL files directory (not publicly, just for internal ref)
// API routes
app.use('/api/auth', authRoutes);
app.use('/api/github', githubRoutes);
app.use('/api/projects', projectRoutes);

// Serve frontend in production
// In Docker: frontend dist is mounted at /app/public
// In dev: fallback to ../frontend/dist
const frontendPath = process.env.FRONTEND_DIST_PATH || path.join(__dirname, '..', 'public');
const frontendFallback = path.join(__dirname, '..', '..', 'frontend', 'dist');
const servePath = require('fs').existsSync(path.join(frontendPath, 'index.html')) ? frontendPath : frontendFallback;
app.use(express.static(servePath));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(servePath, 'index.html'));
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Docklet backend running on port ${PORT}`);
});
