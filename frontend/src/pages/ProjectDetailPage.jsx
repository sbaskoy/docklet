import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Play, Square, RotateCw, Trash2, Globe, Upload,
  Save, Loader2, AlertCircle, Terminal, FileText, Shield, RefreshCw, Settings, GitBranch, Code, X, RotateCcw
} from 'lucide-react';
import { api } from '../api';

const STATUS_COLORS = {
  running: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  stopped: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  deploying: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  error: 'bg-red-500/10 text-red-400 border-red-500/20',
};

export default function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState('');
  const [errorDetails, setErrorDetails] = useState('');
  const [success, setSuccess] = useState('');

  // Tabs
  const [tab, setTab] = useState('overview');

  // Logs
  const [logs, setLogs] = useState('');
  const [logsLoading, setLogsLoading] = useState(false);
  const logsRef = useRef(null);
  const [containers, setContainers] = useState([]);
  const [selectedService, setSelectedService] = useState('');

  // Env
  const [envContent, setEnvContent] = useState('');

  // Domains
  const [domains, setDomains] = useState(['']);

  // SSL
  const [sslForm, setSslForm] = useState({ forceHTTPS: false, redirectWWW: false });
  const [domainSslFiles, setDomainSslFiles] = useState({}); // { domainId: { cert: File, key: File } }

  // Nginx Config
  const [nginxConfig, setNginxConfig] = useState('');
  const [nginxConfigLoading, setNginxConfigLoading] = useState(false);

  // Container status
  const [containerStatus, setContainerStatus] = useState(null);

  // Edit form
  const [editForm, setEditForm] = useState({ name: '', branch: '', composePath: '', port: '', basePath: '' });

  const fetchProject = async () => {
    try {
      const data = await api.getProject(id);
      setProject(data);
      setEnvContent(data.env_content || '');
      setDomains(data.domains?.map((d) => d.domain) || ['']);
      setSslForm({
        forceHTTPS: !!data.force_https,
        redirectWWW: !!data.redirect_www,
      });
      setEditForm({
        name: data.name || '',
        branch: data.branch || '',
        composePath: data.compose_path || '',
        port: String(data.port || ''),
        basePath: data.base_path || '',
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProject(); }, [id]);

  const showMsg = (msg, isError = false, details = '') => {
    if (isError) { setError(msg); setErrorDetails(details); setSuccess(''); }
    else { setSuccess(msg); setError(''); setErrorDetails(''); }
    setTimeout(() => { setError(''); setErrorDetails(''); setSuccess(''); }, details ? 15000 : 4000);
  };

  const handleAction = async (action) => {
    setActionLoading(action);
    try {
      if (action === 'start') await api.startProject(id);
      else if (action === 'stop') await api.stopProject(id);
      else if (action === 'pull') await api.pullProject(id);
      else if (action === 'redeploy') await api.redeployProject(id);
      else if (action === 'delete') {
        if (!confirm('Delete this project permanently? All data will be lost.')) {
          setActionLoading('');
          return;
        }
        await api.deleteProject(id);
        navigate('/');
        return;
      }
      await fetchProject();
      showMsg(`Project ${action} successful`);
    } catch (err) {
      showMsg(err.message, true, err.details || '');
    } finally {
      setActionLoading('');
    }
  };

  const fetchContainers = async () => {
    try {
      const data = await api.getProjectContainers(id);
      setContainers(data.services || []);
    } catch { setContainers([]); }
  };

  const fetchLogs = async (service) => {
    setLogsLoading(true);
    try {
      const svc = service !== undefined ? service : selectedService;
      const data = await api.getProjectLogs(id, 200, svc);
      setLogs(data.logs || 'No logs available');
      setTimeout(() => {
        if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
      }, 50);
    } catch (err) {
      setLogs(`Error: ${err.message}`);
    } finally {
      setLogsLoading(false);
    }
  };

  const fetchContainerStatus = async () => {
    try {
      const data = await api.getProjectStatus(id);
      setContainerStatus(data.containers);
    } catch (err) {
      setContainerStatus(null);
    }
  };

  useEffect(() => {
    if (tab === 'logs') { fetchContainers(); fetchLogs(); }
    if (tab === 'overview') fetchContainerStatus();
    if (tab === 'nginx-config') fetchNginxConfig();
  }, [tab]);

  const saveEnv = async () => {
    setActionLoading('env');
    try {
      await api.updateEnv(id, envContent);
      showMsg('Environment variables saved');
      await fetchProject();
    } catch (err) {
      showMsg(err.message, true);
    } finally {
      setActionLoading('');
    }
  };

  const saveDomains = async () => {
    const valid = domains.filter((d) => d.trim());
    if (!valid.length) return showMsg('At least one domain required', true);
    setActionLoading('domains');
    try {
      await api.updateDomains(id, valid);
      showMsg('Domains updated and nginx reloaded');
      await fetchProject();
    } catch (err) {
      showMsg(err.message, true);
    } finally {
      setActionLoading('');
    }
  };

  const saveSSL = async () => {
    setActionLoading('ssl');
    try {
      await api.updateSSL(id, {
        forceHTTPS: sslForm.forceHTTPS,
        redirectWWW: sslForm.redirectWWW,
      });
      showMsg('SSL settings updated');
      await fetchProject();
    } catch (err) {
      showMsg(err.message, true, err.details || '');
    } finally {
      setActionLoading('');
    }
  };

  const uploadDomainSSL = async (domainId) => {
    const files = domainSslFiles[domainId];
    if (!files || !files.cert || !files.key) {
      return showMsg('Both certificate and key files are required', true);
    }
    setActionLoading(`ssl-${domainId}`);
    try {
      const formData = new FormData();
      formData.append('sslCert', files.cert);
      formData.append('sslKey', files.key);
      await api.uploadDomainSSL(id, domainId, formData);
      setDomainSslFiles((prev) => { const n = { ...prev }; delete n[domainId]; return n; });
      showMsg('SSL certificate uploaded');
      await fetchProject();
    } catch (err) {
      showMsg(err.message, true, err.details || '');
    } finally {
      setActionLoading('');
    }
  };

  const removeDomainSSL = async (domainId) => {
    setActionLoading(`ssl-rm-${domainId}`);
    try {
      await api.removeDomainSSL(id, domainId);
      showMsg('SSL certificate removed');
      await fetchProject();
    } catch (err) {
      showMsg(err.message, true, err.details || '');
    } finally {
      setActionLoading('');
    }
  };

  const fetchNginxConfig = async () => {
    setNginxConfigLoading(true);
    try {
      const data = await api.getNginxConfig(id);
      setNginxConfig(data.config || '');
    } catch (err) {
      setNginxConfig(`# Error loading config: ${err.message}`);
    } finally {
      setNginxConfigLoading(false);
    }
  };

  const saveNginxConfig = async () => {
    setActionLoading('nginx');
    try {
      await api.saveNginxConfig(id, nginxConfig);
      showMsg('Nginx config saved and reloaded');
    } catch (err) {
      showMsg(err.message, true, err.details || '');
    } finally {
      setActionLoading('');
    }
  };

  const resetNginxConfig = async () => {
    if (!confirm('Reset nginx config to auto-generated default? Your custom changes will be lost.')) return;
    setActionLoading('nginx-reset');
    try {
      const data = await api.resetNginxConfig(id);
      setNginxConfig(data.config || '');
      showMsg('Nginx config reset to default');
    } catch (err) {
      showMsg(err.message, true, err.details || '');
    } finally {
      setActionLoading('');
    }
  };

  const saveProject = async () => {
    setActionLoading('settings');
    try {
      await api.updateProject(id, {
        name: editForm.name,
        branch: editForm.branch,
        composePath: editForm.composePath,
        port: editForm.port,
        basePath: editForm.basePath,
      });
      showMsg('Project settings saved');
      await fetchProject();
    } catch (err) {
      showMsg(err.message, true, err.details || '');
    } finally {
      setActionLoading('');
    }
  };

  const addDomain = () => setDomains([...domains, '']);
  const removeDomain = (i) => {
    if (domains.length <= 1) return;
    setDomains(domains.filter((_, idx) => idx !== i));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-400">Project not found</p>
        <button onClick={() => navigate('/')} className="mt-4 text-indigo-400 hover:text-indigo-300 text-sm">Go back</button>
      </div>
    );
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Globe },
    { id: 'logs', label: 'Logs', icon: Terminal },
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'env', label: 'Environment', icon: FileText },
    { id: 'domains', label: 'Domains', icon: Globe },
    { id: 'ssl', label: 'SSL', icon: Shield },
    { id: 'nginx-config', label: 'Nginx Config', icon: Code },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/')} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white truncate">{project.name}</h1>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[project.status] || STATUS_COLORS.stopped}`}>
              {project.status}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">Port {project.port} &middot; {project.branch} &middot; {project.repo_url}</p>
        </div>
        <div className="flex items-center gap-1">
          {project.status === 'running' ? (
            <button onClick={() => handleAction('stop')} disabled={!!actionLoading} className="flex items-center gap-2 px-3 py-2 text-sm text-amber-400 hover:bg-gray-800 rounded-lg transition-colors" title="Stop">
              {actionLoading === 'stop' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
              Stop
            </button>
          ) : (
            <button onClick={() => handleAction('start')} disabled={!!actionLoading} className="flex items-center gap-2 px-3 py-2 text-sm text-emerald-400 hover:bg-gray-800 rounded-lg transition-colors" title="Start">
              {actionLoading === 'start' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Start
            </button>
          )}
          <button onClick={() => handleAction('pull')} disabled={!!actionLoading} className="flex items-center gap-2 px-3 py-2 text-sm text-cyan-400 hover:bg-gray-800 rounded-lg transition-colors" title="Pull from GitHub">
            {actionLoading === 'pull' ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitBranch className="w-4 h-4" />}
            Pull
          </button>
          <button onClick={() => handleAction('redeploy')} disabled={!!actionLoading} className="flex items-center gap-2 px-3 py-2 text-sm text-indigo-400 hover:bg-gray-800 rounded-lg transition-colors" title="Redeploy">
            {actionLoading === 'redeploy' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCw className="w-4 h-4" />}
            Redeploy
          </button>
          <button onClick={() => handleAction('delete')} disabled={!!actionLoading} className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-gray-800 rounded-lg transition-colors" title="Delete">
            {actionLoading === 'delete' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Delete
          </button>
        </div>
      </div>

      {/* Messages */}
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
      {success && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-3 rounded-lg text-sm mb-4">
          {success}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-800 pb-px">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              tab === t.id ? 'text-indigo-400 bg-gray-900 border border-gray-800 border-b-gray-900 -mb-px' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        {/* Overview */}
        {tab === 'overview' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-800/50 rounded-lg p-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Project Info</h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between"><dt className="text-gray-400">Name</dt><dd className="text-white">{project.name}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-400">Port</dt><dd className="text-white">{project.port}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-400">Branch</dt><dd className="text-white">{project.branch}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-400">Compose</dt><dd className="text-white font-mono text-xs">{project.compose_path}</dd></div>
                  {project.base_path && <div className="flex justify-between"><dt className="text-gray-400">Base Path</dt><dd className="text-white font-mono text-xs">{project.base_path}</dd></div>}
                  <div className="flex justify-between"><dt className="text-gray-400">SSL</dt><dd className="text-white">{project.enable_ssl ? 'Enabled' : 'Disabled'}</dd></div>
                </dl>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Access</h3>
                <div className="space-y-1">
                  {project.domains?.map((d) => (
                    <div key={d.id} className="flex items-center gap-2 text-sm text-gray-300">
                      <Globe className="w-3 h-3 text-gray-500" />
                      {d.domain}
                    </div>
                  ))}
                  {project.base_path && (
                    <div className="flex items-center gap-2 text-sm text-gray-300">
                      <Code className="w-3 h-3 text-gray-500" />
                      <span className="font-mono text-xs">http://&lt;server-ip&gt;{project.base_path}/</span>
                    </div>
                  )}
                  {!project.domains?.length && !project.base_path && (
                    <p className="text-sm text-gray-500">No domains or paths configured</p>
                  )}
                </div>
              </div>
            </div>
            {containerStatus && (
              <div className="bg-gray-800/50 rounded-lg p-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Container Status</h3>
                <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap overflow-x-auto">{containerStatus}</pre>
              </div>
            )}
          </div>
        )}

        {/* Logs */}
        {tab === 'logs' && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-medium text-gray-300">Container Logs</h3>
                <select
                  value={selectedService}
                  onChange={(e) => { setSelectedService(e.target.value); fetchLogs(e.target.value); }}
                  className="px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="">All containers</option>
                  {containers.map((c) => (
                    <option key={c.Name || c.Service} value={c.Service || c.Name}>
                      {c.Service || c.Name} ({c.State || 'unknown'})
                    </option>
                  ))}
                </select>
              </div>
              <button onClick={() => fetchLogs()} disabled={logsLoading} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors">
                {logsLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                Refresh
              </button>
            </div>
            <div ref={logsRef} className="bg-gray-950 rounded-lg p-4 max-h-[500px] overflow-auto scrollbar-thin">
              <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap">{logs || 'Loading...'}</pre>
            </div>
          </div>
        )}

        {/* Settings */}
        {tab === 'settings' && (
          <div>
            <h3 className="text-sm font-medium text-gray-300 mb-4">Project Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Project Name</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">Alphanumeric, dashes, underscores only</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Branch</label>
                <input
                  type="text"
                  value={editForm.branch}
                  onChange={(e) => setEditForm({ ...editForm, branch: e.target.value })}
                  className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Docker Compose Path</label>
                <input
                  type="text"
                  value={editForm.composePath}
                  onChange={(e) => setEditForm({ ...editForm, composePath: e.target.value })}
                  className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Port</label>
                <input
                  type="number"
                  value={editForm.port}
                  onChange={(e) => setEditForm({ ...editForm, port: e.target.value })}
                  className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                  min="1"
                  max="65535"
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Base Path</label>
              <input
                type="text"
                value={editForm.basePath}
                onChange={(e) => setEditForm({ ...editForm, basePath: e.target.value })}
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                placeholder="/myapp"
              />
              <p className="text-xs text-gray-500 mt-1">Access via IP: <span className="text-gray-400">http://SERVER_IP{editForm.basePath || '/path'}/</span> — Leave empty to disable path-based access.</p>
            </div>
            <div className="mt-2">
              <p className="text-xs text-gray-500 mb-1">Repo URL: <span className="font-mono text-gray-400">{project.repo_url}</span></p>
              <p className="text-xs text-gray-500 mb-3">Changing port or base path will regenerate nginx config. Redeploy to apply branch changes.</p>
            </div>
            <button
              onClick={saveProject}
              disabled={actionLoading === 'settings'}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
            >
              {actionLoading === 'settings' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Settings
            </button>
          </div>
        )}

        {/* Environment */}
        {tab === 'env' && (
          <div>
            <h3 className="text-sm font-medium text-gray-300 mb-3">Environment Variables (.env)</h3>
            <textarea
              value={envContent}
              onChange={(e) => setEnvContent(e.target.value)}
              rows={12}
              className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm font-mono"
              placeholder={"DATABASE_NAME=mydb\nDATABASE_USER=admin"}
            />
            <p className="text-xs text-gray-500 mt-1 mb-3">Changes are saved to disk. Restart the project to apply.</p>
            <button
              onClick={saveEnv}
              disabled={actionLoading === 'env'}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
            >
              {actionLoading === 'env' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Environment
            </button>
          </div>
        )}

        {/* Domains */}
        {tab === 'domains' && (
          <div>
            <h3 className="text-sm font-medium text-gray-300 mb-3">Manage Domains</h3>
            <div className="space-y-2 mb-3">
              {domains.map((d, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    value={d}
                    onChange={(e) => {
                      const upd = [...domains];
                      upd[i] = e.target.value;
                      setDomains(upd);
                    }}
                    className="flex-1 px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                    placeholder="example.com"
                  />
                  {domains.length > 1 && (
                    <button onClick={() => removeDomain(i)} className="p-2.5 text-gray-500 hover:text-red-400 rounded-lg transition-colors">×</button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={addDomain} className="text-xs text-indigo-400 hover:text-indigo-300 font-medium mb-4 block">+ Add domain</button>
            <p className="text-xs text-gray-500 mb-3">Nginx config will be regenerated and reloaded automatically.</p>
            <button
              onClick={saveDomains}
              disabled={actionLoading === 'domains'}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
            >
              {actionLoading === 'domains' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Domains
            </button>
          </div>
        )}

        {/* SSL */}
        {tab === 'ssl' && (
          <div>
            <h3 className="text-sm font-medium text-gray-300 mb-4">SSL Certificates (per domain)</h3>
            <div className="space-y-4 mb-6">
              {project.domains?.map((d) => (
                <div key={d.id} className="bg-gray-800/50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-gray-500" />
                      <span className="text-sm font-medium text-white">{d.domain}</span>
                    </div>
                    {d.ssl_cert_path ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">SSL Active</span>
                        <button
                          onClick={() => removeDomainSSL(d.id)}
                          disabled={actionLoading === `ssl-rm-${d.id}`}
                          className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                        >
                          {actionLoading === `ssl-rm-${d.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                          Remove
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-500">No SSL</span>
                    )}
                  </div>
                  {!d.ssl_cert_path && (
                    <div className="mt-2">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="flex items-center gap-2 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg cursor-pointer hover:border-gray-600 transition-colors">
                            <Upload className="w-4 h-4 text-gray-500 flex-shrink-0" />
                            <span className="text-xs text-gray-400 truncate">{domainSslFiles[d.id]?.cert?.name || 'Certificate (.crt)'}</span>
                            <input type="file" accept=".crt,.pem" onChange={(e) => setDomainSslFiles((prev) => ({ ...prev, [d.id]: { ...prev[d.id], cert: e.target.files[0] } }))} className="hidden" />
                          </label>
                        </div>
                        <div>
                          <label className="flex items-center gap-2 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg cursor-pointer hover:border-gray-600 transition-colors">
                            <Upload className="w-4 h-4 text-gray-500 flex-shrink-0" />
                            <span className="text-xs text-gray-400 truncate">{domainSslFiles[d.id]?.key?.name || 'Private Key (.key)'}</span>
                            <input type="file" accept=".key,.pem" onChange={(e) => setDomainSslFiles((prev) => ({ ...prev, [d.id]: { ...prev[d.id], key: e.target.files[0] } }))} className="hidden" />
                          </label>
                        </div>
                      </div>
                      <button
                        onClick={() => uploadDomainSSL(d.id)}
                        disabled={actionLoading === `ssl-${d.id}` || !domainSslFiles[d.id]?.cert || !domainSslFiles[d.id]?.key}
                        className="mt-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                      >
                        {actionLoading === `ssl-${d.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                        Upload SSL
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <h3 className="text-sm font-medium text-gray-300 mb-3">Global SSL Options</h3>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sslForm.forceHTTPS}
                  onChange={(e) => setSslForm({ ...sslForm, forceHTTPS: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0"
                />
                <span className="text-sm text-gray-300">Force HTTPS (redirect HTTP to HTTPS)</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sslForm.redirectWWW}
                  onChange={(e) => setSslForm({ ...sslForm, redirectWWW: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0"
                />
                <span className="text-sm text-gray-300">Redirect www to non-www</span>
              </label>
            </div>
            <div className="mt-4">
              <p className="text-xs text-gray-500 mb-3">These options apply to all domains with SSL certificates.</p>
              <button
                onClick={saveSSL}
                disabled={actionLoading === 'ssl'}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
              >
                {actionLoading === 'ssl' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Options
              </button>
            </div>
          </div>
        )}

        {/* Nginx Config */}
        {tab === 'nginx-config' && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-300">Nginx Configuration</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={resetNginxConfig}
                  disabled={actionLoading === 'nginx-reset'}
                  className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 px-2.5 py-1.5 rounded-lg transition-colors"
                >
                  {actionLoading === 'nginx-reset' ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                  Reset to Default
                </button>
                <button
                  onClick={fetchNginxConfig}
                  disabled={nginxConfigLoading}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
                >
                  {nginxConfigLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  Refresh
                </button>
              </div>
            </div>
            <textarea
              value={nginxConfig}
              onChange={(e) => setNginxConfig(e.target.value)}
              rows={20}
              className="w-full px-3 py-2.5 bg-gray-950 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-xs font-mono leading-relaxed"
              placeholder="Loading..."
              spellCheck={false}
            />
            <div className="flex items-center justify-between mt-3">
              <p className="text-xs text-gray-500">If the config is invalid, it will be rolled back automatically.</p>
              <button
                onClick={saveNginxConfig}
                disabled={actionLoading === 'nginx'}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
              >
                {actionLoading === 'nginx' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save & Reload
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
