import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GitBranch, Search, X, Upload, Loader2, AlertCircle } from 'lucide-react';
import { api } from '../api';

export default function NewProjectPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [errorDetails, setErrorDetails] = useState('');
  const [deploying, setDeploying] = useState(false);

  // GitHub
  const [repos, setRepos] = useState([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [repoSearch, setRepoSearch] = useState('');
  const [selectedRepo, setSelectedRepo] = useState(null);
  const [branches, setBranches] = useState([]);
  const [branchesLoading, setBranchesLoading] = useState(false);

  // Form fields
  const [form, setForm] = useState({
    name: '',
    branch: '',
    composePath: 'docker-compose.yml',
    port: '',
    envContent: '',
    enableSSL: false,
    forceHTTPS: false,
    redirectWWW: false,
  });
  const [domains, setDomains] = useState(['']);
  const [sslCert, setSslCert] = useState(null);
  const [sslKey, setSslKey] = useState(null);

  // Load repos
  const loadRepos = async () => {
    setReposLoading(true);
    try {
      const data = await api.getRepos();
      setRepos(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setReposLoading(false);
    }
  };

  useEffect(() => { loadRepos(); }, []);

  // Load branches when repo selected
  const handleSelectRepo = async (repo) => {
    setSelectedRepo(repo);
    const namePart = repo.name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
    setForm((prev) => ({ ...prev, name: namePart, branch: repo.default_branch }));
    setBranchesLoading(true);
    try {
      const [owner, repoName] = repo.full_name.split('/');
      const data = await api.getBranches(owner, repoName);
      setBranches(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBranchesLoading(false);
    }
    setStep(2);
  };

  const handleDomainChange = (index, value) => {
    const updated = [...domains];
    updated[index] = value;
    setDomains(updated);
  };

  const addDomain = () => setDomains([...domains, '']);
  const removeDomain = (index) => {
    if (domains.length <= 1) return;
    setDomains(domains.filter((_, i) => i !== index));
  };

  const handleDeploy = async () => {
    setError('');
    const validDomains = domains.filter((d) => d.trim());
    if (!form.name) return setError('Project name is required');
    if (!selectedRepo) return setError('Select a repository');
    if (!form.branch) return setError('Select a branch');
    if (!validDomains.length) return setError('At least one domain is required');

    setDeploying(true);
    try {
      const formData = new FormData();
      formData.append('name', form.name);
      formData.append('repoUrl', selectedRepo.clone_url);
      formData.append('branch', form.branch);
      formData.append('composePath', form.composePath);
      if (form.port) formData.append('port', form.port);
      formData.append('domains', JSON.stringify(validDomains));
      formData.append('envContent', form.envContent);
      formData.append('enableSSL', form.enableSSL);
      formData.append('forceHTTPS', form.forceHTTPS);
      formData.append('redirectWWW', form.redirectWWW);
      if (sslCert) formData.append('sslCert', sslCert);
      if (sslKey) formData.append('sslKey', sslKey);

      const data = await api.createProject(formData);
      if (data.project) {
        navigate(`/projects/${data.project.id}`);
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err.message);
      setErrorDetails(err.details || '');
    } finally {
      setDeploying(false);
    }
  };

  const filteredRepos = repos.filter((r) =>
    r.full_name.toLowerCase().includes(repoSearch.toLowerCase())
  );

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">New Project</h1>

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

      {/* Step 1: Select Repository */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">1. Select Repository</h2>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search repositories..."
            value={repoSearch}
            onChange={(e) => setRepoSearch(e.target.value)}
            className="w-full pl-10 pr-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
          />
        </div>
        {reposLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
          </div>
        ) : (
          <div className="max-h-60 overflow-y-auto space-y-1 scrollbar-thin">
            {filteredRepos.map((repo) => (
              <button
                key={repo.id}
                onClick={() => handleSelectRepo(repo)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  selectedRepo?.id === repo.id
                    ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                    : 'text-gray-300 hover:bg-gray-800 border border-transparent'
                }`}
              >
                <div className="font-medium">{repo.full_name}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {repo.private ? 'Private' : 'Public'} &middot; {repo.default_branch}
                </div>
              </button>
            ))}
            {filteredRepos.length === 0 && !reposLoading && (
              <p className="text-sm text-gray-500 text-center py-4">No repositories found. Check your GitHub token in Settings.</p>
            )}
          </div>
        )}
      </div>

      {/* Step 2: Project Configuration */}
      {step >= 2 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">2. Project Configuration</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Project Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                placeholder="my-project"
              />
              <p className="text-xs text-gray-500 mt-1">Alphanumeric, dashes, underscores only</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Branch</label>
              {branchesLoading ? (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg">
                  <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                  <span className="text-sm text-gray-500">Loading branches...</span>
                </div>
              ) : (
                <select
                  value={form.branch}
                  onChange={(e) => setForm({ ...form, branch: e.target.value })}
                  className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                >
                  {branches.map((b) => (
                    <option key={b.name} value={b.name}>{b.name}</option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Docker Compose Path</label>
              <input
                type="text"
                value={form.composePath}
                onChange={(e) => setForm({ ...form, composePath: e.target.value })}
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                placeholder="docker-compose.yml"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Port</label>
              <input
                type="number"
                value={form.port}
                onChange={(e) => setForm({ ...form, port: e.target.value })}
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                placeholder="Auto-assign"
                min="1"
                max="65535"
              />
              <p className="text-xs text-gray-500 mt-1">Leave empty for auto-assign (starting from 10000)</p>
            </div>
          </div>

          {/* Domains */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Domains</label>
            <div className="space-y-2">
              {domains.map((d, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    value={d}
                    onChange={(e) => handleDomainChange(i, e.target.value)}
                    className="flex-1 px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                    placeholder="example.com"
                  />
                  {domains.length > 1 && (
                    <button onClick={() => removeDomain(i)} className="p-2.5 text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={addDomain} className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 font-medium">
              + Add domain
            </button>
          </div>

          {/* ENV */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Environment Variables (.env)</label>
            <textarea
              value={form.envContent}
              onChange={(e) => setForm({ ...form, envContent: e.target.value })}
              rows={6}
              className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm font-mono"
              placeholder={"DATABASE_NAME=mydb\nDATABASE_USER=admin\nDATABASE_PASSWORD=secret\nDEBUG=true"}
            />
            <p className="text-xs text-gray-500 mt-1">Paste your raw .env content. Formatting is preserved exactly.</p>
          </div>

          {/* SSL Settings */}
          <div className="mt-4 pt-4 border-t border-gray-800">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">SSL Settings</h3>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.enableSSL}
                  onChange={(e) => setForm({ ...form, enableSSL: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0"
                />
                <span className="text-sm text-gray-300">Enable SSL</span>
              </label>

              {form.enableSSL && (
                <>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.forceHTTPS}
                      onChange={(e) => setForm({ ...form, forceHTTPS: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0"
                    />
                    <span className="text-sm text-gray-300">Force HTTPS (redirect HTTP to HTTPS)</span>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.redirectWWW}
                      onChange={(e) => setForm({ ...form, redirectWWW: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0"
                    />
                    <span className="text-sm text-gray-300">Redirect www to non-www</span>
                  </label>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1.5">SSL Certificate (.crt)</label>
                      <label className="flex items-center gap-2 px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg cursor-pointer hover:bg-gray-750 transition-colors">
                        <Upload className="w-4 h-4 text-gray-500" />
                        <span className="text-sm text-gray-400 truncate">{sslCert ? sslCert.name : 'Choose file...'}</span>
                        <input type="file" accept=".crt,.pem" onChange={(e) => setSslCert(e.target.files[0])} className="hidden" />
                      </label>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1.5">SSL Key (.key)</label>
                      <label className="flex items-center gap-2 px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg cursor-pointer hover:bg-gray-750 transition-colors">
                        <Upload className="w-4 h-4 text-gray-500" />
                        <span className="text-sm text-gray-400 truncate">{sslKey ? sslKey.name : 'Choose file...'}</span>
                        <input type="file" accept=".key,.pem" onChange={(e) => setSslKey(e.target.files[0])} className="hidden" />
                      </label>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Deploy button */}
          <div className="mt-6 flex justify-end">
            <button
              onClick={handleDeploy}
              disabled={deploying}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white font-medium px-6 py-2.5 rounded-lg transition-colors flex items-center gap-2"
            >
              {deploying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Deploying...
                </>
              ) : (
                'Deploy Project'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
