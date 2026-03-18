import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Globe, Play, Square, RotateCw, Trash2, ExternalLink, AlertCircle, Loader2 } from 'lucide-react';
import { api } from '../api';

const STATUS_COLORS = {
  running: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  stopped: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  deploying: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  error: 'bg-red-500/10 text-red-400 border-red-500/20',
};

export default function DashboardPage() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [error, setError] = useState('');
  const [errorDetails, setErrorDetails] = useState('');

  const fetchProjects = async () => {
    try {
      const data = await api.getProjects();
      setProjects(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProjects(); }, []);

  const handleAction = async (id, action) => {
    setActionLoading(`${id}-${action}`);
    try {
      if (action === 'start') await api.startProject(id);
      else if (action === 'stop') await api.stopProject(id);
      else if (action === 'redeploy') await api.redeployProject(id);
      else if (action === 'delete') {
        if (!confirm('Are you sure you want to delete this project? This cannot be undone.')) {
          setActionLoading(null);
          return;
        }
        await api.deleteProject(id);
      }
      await fetchProjects();
    } catch (err) {
      setError(err.message);
      setErrorDetails(err.details || '');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Projects</h1>
        <Link
          to="/new"
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + New Project
        </Link>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg text-sm mb-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1 font-medium">{error}</span>
            <button onClick={() => { setError(''); setErrorDetails(''); }} className="text-red-400 hover:text-red-300">&times;</button>
          </div>
          {errorDetails && (
            <pre className="mt-2 text-xs text-red-300/80 bg-red-500/5 rounded p-3 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap break-all font-mono">{errorDetails}</pre>
          )}
        </div>
      )}

      {projects.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <Globe className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-300 mb-2">No projects yet</h3>
          <p className="text-gray-500 mb-4">Deploy your first project to get started</p>
          <Link to="/new" className="text-indigo-400 hover:text-indigo-300 text-sm font-medium">
            Create a project &rarr;
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <div key={project.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <Link to={`/projects/${project.id}`} className="text-lg font-semibold text-white hover:text-indigo-400 transition-colors truncate">
                      {project.name}
                    </Link>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[project.status] || STATUS_COLORS.stopped}`}>
                      {project.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {project.domains?.map((d) => (
                      <span key={d.id} className="inline-flex items-center gap-1 text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded">
                        <Globe className="w-3 h-3" />
                        {d.domain}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>Port: {project.port}</span>
                    <span>Branch: {project.branch}</span>
                    {project.enable_ssl ? <span className="text-emerald-500">SSL</span> : null}
                  </div>
                </div>

                <div className="flex items-center gap-1 ml-4">
                  {project.status === 'running' ? (
                    <button
                      onClick={() => handleAction(project.id, 'stop')}
                      disabled={!!actionLoading}
                      className="p-2 text-gray-400 hover:text-amber-400 hover:bg-gray-800 rounded-lg transition-colors"
                      title="Stop"
                    >
                      {actionLoading === `${project.id}-stop` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleAction(project.id, 'start')}
                      disabled={!!actionLoading}
                      className="p-2 text-gray-400 hover:text-emerald-400 hover:bg-gray-800 rounded-lg transition-colors"
                      title="Start"
                    >
                      {actionLoading === `${project.id}-start` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    </button>
                  )}
                  <button
                    onClick={() => handleAction(project.id, 'redeploy')}
                    disabled={!!actionLoading}
                    className="p-2 text-gray-400 hover:text-indigo-400 hover:bg-gray-800 rounded-lg transition-colors"
                    title="Redeploy"
                  >
                    {actionLoading === `${project.id}-redeploy` ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCw className="w-4 h-4" />}
                  </button>
                  <Link
                    to={`/projects/${project.id}`}
                    className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                    title="Details"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Link>
                  <button
                    onClick={() => handleAction(project.id, 'delete')}
                    disabled={!!actionLoading}
                    className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors"
                    title="Delete"
                  >
                    {actionLoading === `${project.id}-delete` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
