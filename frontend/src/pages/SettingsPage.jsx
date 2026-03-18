import { useState, useEffect } from 'react';
import { Github, Eye, EyeOff, Loader2, AlertCircle, Check, Trash2 } from 'lucide-react';
import { api } from '../api';

export default function SettingsPage() {
  const [tokenStatus, setTokenStatus] = useState(null);
  const [newToken, setNewToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchToken = async () => {
    try {
      const data = await api.getGithubToken();
      setTokenStatus(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchToken(); }, []);

  const showMsg = (msg, isError = false) => {
    if (isError) { setError(msg); setSuccess(''); }
    else { setSuccess(msg); setError(''); }
    setTimeout(() => { setError(''); setSuccess(''); }, 4000);
  };

  const handleSaveToken = async (e) => {
    e.preventDefault();
    if (!newToken.trim()) return showMsg('Token is required', true);
    setSaving(true);
    try {
      await api.setGithubToken(newToken.trim());
      setNewToken('');
      await fetchToken();
      showMsg('GitHub token saved successfully');
    } catch (err) {
      showMsg(err.message, true);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteToken = async () => {
    if (!confirm('Remove GitHub token?')) return;
    setSaving(true);
    try {
      await api.deleteGithubToken();
      await fetchToken();
      showMsg('GitHub token removed');
    } catch (err) {
      showMsg(err.message, true);
    } finally {
      setSaving(false);
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
      <h1 className="text-2xl font-bold text-white mb-6">Settings</h1>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg text-sm mb-4 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}
      {success && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-3 rounded-lg text-sm mb-4 flex items-center gap-2">
          <Check className="w-4 h-4 flex-shrink-0" />{success}
        </div>
      )}

      {/* GitHub Token */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-gray-800 rounded-lg">
            <Github className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">GitHub Integration</h2>
            <p className="text-sm text-gray-500">Connect your GitHub account using a personal access token</p>
          </div>
        </div>

        {tokenStatus?.hasToken ? (
          <div className="bg-gray-800/50 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-300">Token configured</p>
                <p className="text-xs text-gray-500 font-mono mt-1">{tokenStatus.token}</p>
              </div>
              <button
                onClick={handleDeleteToken}
                disabled={saving}
                className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-gray-800 rounded-lg transition-colors"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-amber-500/5 border border-amber-500/10 rounded-lg p-3 mb-4">
            <p className="text-sm text-amber-400">No GitHub token configured. Add one to list and deploy repositories.</p>
          </div>
        )}

        <form onSubmit={handleSaveToken}>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">
            {tokenStatus?.hasToken ? 'Replace Token' : 'Personal Access Token'}
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showToken ? 'text' : 'password'}
                value={newToken}
                onChange={(e) => setNewToken(e.target.value)}
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm pr-10"
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              />
              <button type="button" onClick={() => setShowToken(!showToken)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <button
              type="submit"
              disabled={saving || !newToken.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Create a token at <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300">github.com/settings/tokens</a> with <code className="text-gray-400">repo</code> scope.
          </p>
        </form>
      </div>
    </div>
  );
}
