import { useState, useEffect } from 'react';
import { Package, Play, AlertCircle, CheckCircle, Loader, Zap, Info } from 'lucide-react';

interface Repository {
  id: string;
  name: string;
  path: string;
  stack?: string;
  confidence_score?: number;
  framework?: string;
  detected_files?: string[];
  requires_db?: boolean;
  internal_port?: number;
}

export function DeploymentPage() {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetch cloned repositories from backend/repos/ folder
  useEffect(() => {
    const fetchRepositories = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/deployments/cloned-repos');
        if (response.ok) {
          const data = await response.json();
          setRepositories(data.sort((a: Repository, b: Repository) => a.name.localeCompare(b.name)));
          setError(null);
        } else {
          setError('Failed to load cloned repositories');
        }
      } catch (err) {
        console.error('Failed to fetch repositories:', err);
        setError('Failed to load cloned repositories');
      } finally {
        setLoading(false);
      }
    };
    fetchRepositories();
  }, []);

  const selectedRepo = repositories.find(r => r.id === selectedRepoId);

  const handleDeploy = async () => {
    if (!selectedRepoId) {
      setError('Please select a repository to deploy');
      return;
    }

    const repo = repositories.find(r => r.id === selectedRepoId);
    if (!repo) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/deployments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo_id: selectedRepoId,
          repo_name: repo.name,
          repo_path: repo.path
        })
      });

      if (response.ok) {
        const data = await response.json();
        setSuccess(`✓ Successfully deployed "${repo.name}" on port ${data.assigned_port}`);
        setSelectedRepoId('');
        // Refresh repositories list
        const refreshResponse = await fetch('/api/deployments/cloned-repos');
        if (refreshResponse.ok) {
          const data = await refreshResponse.json();
          setRepositories(data.sort((a: Repository, b: Repository) => a.name.localeCompare(b.name)));
        }
      } else {
        const errData = await response.json();
        setError(`Failed to deploy: ${errData.detail}`);
      }
    } catch (err) {
      console.error('Deployment error:', err);
      setError('Deployment failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg-secondary)] p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Zap className="w-8 h-8 text-[var(--color-brand-500)]" />
            <h1 className="text-4xl font-bold text-[var(--color-fg-primary)]">Smart Deployments</h1>
          </div>
          <p className="text-[var(--color-fg-tertiary)]">Automatically detect stack, generate Docker config, and deploy containers</p>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-6 p-4 bg-[var(--color-error-100)] dark:bg-[var(--color-error-900)] border border-[var(--color-error-300)] dark:border-[var(--color-error-800)] rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-[var(--color-error-600)] dark:text-[var(--color-error-400)] mt-0.5 flex-shrink-0" />
            <p className="text-[var(--color-error-700)] dark:text-[var(--color-error-200)]">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-[var(--color-success-100)] dark:bg-[var(--color-success-900)] border border-[var(--color-success-300)] dark:border-[var(--color-success-800)] rounded-lg flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-[var(--color-success-600)] dark:text-[var(--color-success-400)] mt-0.5 flex-shrink-0" />
            <p className="text-[var(--color-success-700)] dark:text-[var(--color-success-200)]">{success}</p>
          </div>
        )}

        {/* Deployment Form */}
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-lg p-8 shadow-sm">
          <h2 className="text-2xl font-semibold text-[var(--color-fg-primary)] mb-6">Select Repository to Deploy</h2>
          
          {repositories.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-16 h-16 text-[var(--color-fg-quaternary)] mx-auto mb-4" />
              <p className="text-[var(--color-fg-tertiary)] text-lg">No cloned repositories found</p>
              <p className="text-sm text-[var(--color-fg-quaternary)] mt-2">Clone some repositories to get started with deployments</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Repository Select Dropdown */}
              <div>
                <label htmlFor="repo-select" className="block text-sm font-medium text-[var(--color-fg-secondary)] mb-2">
                  Choose a Repository
                </label>
                <select
                  id="repo-select"
                  value={selectedRepoId}
                  onChange={(e) => {
                    setSelectedRepoId(e.target.value);
                    setError(null);
                    setSuccess(null);
                  }}
                  className="w-full px-4 py-3 bg-[var(--color-bg-tertiary)] border border-[var(--color-border-secondary)] rounded-lg text-[var(--color-fg-primary)] focus:outline-none focus:border-[var(--color-brand-500)] focus:ring-2 focus:ring-[var(--color-brand-500)]/30 transition"
                >
                  <option value="">-- Select a repository --</option>
                  {repositories.map((repo) => (
                    <option key={repo.id} value={repo.id}>
                      {repo.name}
                      {repo.stack ? ` (${repo.stack.toUpperCase()})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Repository Details */}
              {selectedRepo && (
                <div className="p-4 bg-[var(--color-brand-50)] dark:bg-[var(--color-brand-900)]/20 border border-[var(--color-brand-200)] dark:border-[var(--color-brand-800)] rounded-lg">
                  <div className="flex items-start gap-3">
                    <Info className="w-5 h-5 text-[var(--color-brand-600)] dark:text-[var(--color-brand-400)] mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-[var(--color-fg-primary)] mb-3">{selectedRepo.name}</h3>
                      
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="text-[var(--color-fg-tertiary)]">Path:</span>
                          <p className="text-[var(--color-fg-secondary)] font-mono text-xs break-all">{selectedRepo.path}</p>
                        </div>

                        {selectedRepo.stack && (
                          <div>
                            <span className="text-[var(--color-fg-tertiary)]">Detected Stack:</span>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className="inline-flex items-center gap-1 px-3 py-1 bg-[var(--color-brand-200)] dark:bg-[var(--color-brand-700)] text-[var(--color-brand-800)] dark:text-[var(--color-brand-100)] text-xs rounded-full font-semibold">
                                {selectedRepo.stack.toUpperCase()}
                              </span>
                              {selectedRepo.framework && (
                                <span className="text-[var(--color-fg-secondary)]">{selectedRepo.framework}</span>
                              )}
                              <span className="text-[var(--color-fg-quaternary)]">Confidence: {selectedRepo.confidence_score}%</span>
                            </div>
                          </div>
                        )}

                        {selectedRepo.requires_db && (
                          <div className="mt-2 p-2 bg-[var(--color-warning-100)] dark:bg-[var(--color-warning-900)]/30 border border-[var(--color-warning-300)] dark:border-[var(--color-warning-700)] rounded text-[var(--color-warning-700)] dark:text-[var(--color-warning-200)] text-xs">
                            ⚠️ This repository requires a database
                          </div>
                        )}

                        {selectedRepo.detected_files && selectedRepo.detected_files.length > 0 && (
                          <div>
                            <span className="text-[var(--color-fg-tertiary)]">Detected Files:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {selectedRepo.detected_files.slice(0, 5).map((file: string, idx: number) => (
                                <span key={idx} className="px-2 py-1 bg-[var(--color-bg-secondary)] text-[var(--color-fg-secondary)] text-xs rounded">
                                  {file}
                                </span>
                              ))}
                              {selectedRepo.detected_files.length > 5 && (
                                <span className="px-2 py-1 bg-[var(--color-bg-secondary)] text-[var(--color-fg-tertiary)] text-xs rounded">
                                  +{selectedRepo.detected_files.length - 5} more
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Deploy Button */}
              <div className="flex gap-3 pt-4 border-t border-[var(--color-border-secondary)]">
                <button
                  onClick={() => {
                    setSelectedRepoId('');
                    setError(null);
                    setSuccess(null);
                  }}
                  className="px-6 py-3 bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-bg-secondary)] text-[var(--color-fg-primary)] border border-[var(--color-border-secondary)] rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!selectedRepoId || loading}
                >
                  Clear
                </button>
                <button
                  onClick={handleDeploy}
                  disabled={!selectedRepoId || loading}
                  className="flex-1 px-6 py-3 bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] disabled:bg-[var(--color-gray-300)] dark:disabled:bg-[var(--color-gray-700)] text-[color:var(--color-fg-white)] font-semibold rounded-lg flex items-center justify-center gap-2 transition"
                >
                  {loading ? (
                    <>
                      <Loader className="w-5 h-5 animate-spin" />
                      Deploying...
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5" />
                      Deploy Repository
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
