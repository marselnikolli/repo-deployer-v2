import { useState } from 'react';
import { Button, Input, Label, Text, Heading } from 'react-aria-components';
import { Upload as UploadIcon, Plus as PlusIcon, CheckCircle as CheckIcon, AlertCircle as ErrorIcon } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';

const apiClient = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  }
});

interface ImportJob {
  id: number;
  source_type: string;
  status: string;
  total_repositories: number;
  imported_repositories: number;
  failed_repositories: number;
  error_message?: string;
  created_at: string;
}

export default function ImportsPage() {
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  // const [loading, setLoading] = useState(false); // Not used
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'github' | 'gitlab' | 'bitbucket' | 'files'>('github');
  
  // GitHub form
  const [githubToken, setGithubToken] = useState('');
  const [importType, setImportType] = useState<'stars' | 'org'>('stars');
  const [orgName, setOrgName] = useState('');
  
  // GitLab form
  const [gitlabToken, setGitlabToken] = useState('');
  const [groupId, setGroupId] = useState('');
  const [gitlabUrl, setGitlabUrl] = useState('https://gitlab.com');
  
  // Bitbucket form
  const [bbUser, setBbUser] = useState('');
  const [bbPassword, setBbPassword] = useState('');
  const [teamSlug, setTeamSlug] = useState('');

  const loadJobs = async () => {
    try {
      const response = await apiClient.get('/imports/jobs');
      setJobs(response.data);
    } catch (err: any) {
      console.error('Failed to load jobs:', err);
    }
  };

  const handleGithubImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!githubToken) {
      toast.error('GitHub token required');
      return;
    }

    try {
      const endpoint = importType === 'stars' ? '/imports/github/stars' : '/imports/github/org';
      const payload = {
        github_token: githubToken,
        import_type: importType,
        org_name: importType === 'org' ? orgName : undefined
      };

      const response = await apiClient.post(endpoint, payload);
      toast.success(`Import started: ${response.data.imported} repos imported`);
      
      setGithubToken('');
      setOrgName('');
      setIsDialogOpen(false);
      await loadJobs();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Import failed');
    }
  };

  const handleGitLabImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gitlabToken || !groupId) {
      toast.error('GitLab token and group ID required');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('gitlab_token', gitlabToken);
      formData.append('group_id', groupId);
      formData.append('gitlab_url', gitlabUrl);

      const response = await apiClient.post('/imports/gitlab/group', formData);
      toast.success(`Import started: ${response.data.imported} repos imported`);
      
      setGitlabToken('');
      setGroupId('');
      setIsDialogOpen(false);
      await loadJobs();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Import failed');
    }
  };

  const handleBitbucketImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bbUser || !bbPassword || !teamSlug) {
      toast.error('Bitbucket credentials and team slug required');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('bitbucket_user', bbUser);
      formData.append('bitbucket_password', bbPassword);
      formData.append('team_slug', teamSlug);

      const response = await apiClient.post('/imports/bitbucket/team', formData);
      toast.success(`Import started: ${response.data.imported} repos imported`);
      
      setBbUser('');
      setBbPassword('');
      setTeamSlug('');
      setIsDialogOpen(false);
      await loadJobs();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Import failed');
    }
  };

  const handleFileImport = async (e: React.FormEvent, fileType: 'json' | 'csv' | 'opml') => {
    e.preventDefault();
    const fileInput = document.getElementById(`${fileType}-input`) as HTMLInputElement;
    
    if (!fileInput?.files?.[0]) {
      toast.error('Please select a file');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('file', fileInput.files[0]);

      const response = await apiClient.post(`/imports/file/${fileType}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      toast.success(`Import started: ${response.data.imported} repos imported`);
      fileInput.value = '';
      setIsDialogOpen(false);
      await loadJobs();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Import failed');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 bg-green-50';
      case 'failed':
        return 'text-red-600 bg-red-50';
      case 'running':
        return 'text-blue-600 bg-blue-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const getSourceLabel = (type: string) => {
    const labels: Record<string, string> = {
      github_stars: '⭐ GitHub Stars',
      github_org: '🏢 GitHub Organization',
      gitlab: '🦊 GitLab Group',
      bitbucket: '🪣 Bitbucket Team',
      opml: '📋 OPML File',
      json: '📄 JSON File',
      csv: '📊 CSV File'
    };
    return labels[type] || type;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Heading level={1} className="text-3xl font-bold text-slate-900 mb-2">
              Import Repositories
            </Heading>
            <Text className="text-[var(--color-fg-tertiary)]">Import from GitHub, GitLab, Bitbucket, or upload files</Text>
          </div>
          <Button
            onPress={() => setIsDialogOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] text-[color:var(--color-fg-white)] rounded-lg font-medium transition-colors"
          >
            <PlusIcon className="w-5 h-5" />
            New Import
          </Button>
        </div>

        {/* Import Jobs History */}
        <div className="bg-[var(--color-bg-primary)] rounded-lg border border-[var(--color-border-secondary)] p-6">
          <Heading level={2} className="text-xl font-bold text-slate-900 mb-4">
            Recent Imports
          </Heading>

          {jobs.length === 0 ? (
            <Text className="text-slate-600 text-center py-8">No imports yet</Text>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <div key={job.id} className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Text className="font-medium text-slate-900">{getSourceLabel(job.source_type)}</Text>
                      <span className={`px-2 py-1 text-xs font-medium rounded ${getStatusColor(job.status)}`}>
                        {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                      </span>
                    </div>
                    <Text className="text-sm text-slate-600">
                      Imported: {job.imported_repositories} | Failed: {job.failed_repositories} | Total: {job.total_repositories}
                    </Text>
                  </div>
                  <div className="flex items-center gap-2">
                    {job.status === 'completed' && (
                      <CheckIcon className="w-5 h-5 text-green-600" />
                    )}
                    {job.status === 'failed' && (
                      <ErrorIcon className="w-5 h-5 text-red-600" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Import Dialog */}
      {isDialogOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen p-4 bg-black/50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 max-h-96 overflow-y-auto">
            <Heading level={2} className="text-2xl font-bold text-slate-900 mb-4">
              Import Repositories
            </Heading>

            {/* Tab Navigation */}
            <div className="flex gap-2 mb-6 border-b border-slate-200">
              {(['github', 'gitlab', 'bitbucket', 'files'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 font-medium border-b-2 transition-colors ${
                    activeTab === tab
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab === 'github' && '⭐ GitHub'}
                  {tab === 'gitlab' && '🦊 GitLab'}
                  {tab === 'bitbucket' && '🪣 Bitbucket'}
                  {tab === 'files' && '📁 Files'}
                </button>
              ))}
            </div>

            {/* GitHub Tab */}
            {activeTab === 'github' && (
              <form onSubmit={handleGithubImport} className="space-y-4">
                <div>
                  <Label className="block text-sm font-medium text-slate-700 mb-1">Import Type</Label>
                  <select
                    value={importType}
                    onChange={(e) => setImportType(e.target.value as 'stars' | 'org')}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="stars">Your Starred Repositories</option>
                    <option value="org">Organization Repositories</option>
                  </select>
                </div>

                {importType === 'org' && (
                  <div>
                    <Label className="block text-sm font-medium text-slate-700 mb-1">Organization Name</Label>
                    <Input
                      type="text"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      placeholder="e.g., microsoft"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}

                <div>
                  <Label className="block text-sm font-medium text-slate-700 mb-1">GitHub Token</Label>
                  <Input
                    type="password"
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                    placeholder="ghp_..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    type="button"
                    onPress={() => setIsDialogOpen(false)}
                    className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                  >
                    Start Import
                  </Button>
                </div>
              </form>
            )}

            {/* GitLab Tab */}
            {activeTab === 'gitlab' && (
              <form onSubmit={handleGitLabImport} className="space-y-4">
                <div>
                  <Label className="block text-sm font-medium text-slate-700 mb-1">GitLab URL</Label>
                  <Input
                    type="text"
                    value={gitlabUrl}
                    onChange={(e) => setGitlabUrl(e.target.value)}
                    placeholder="https://gitlab.com"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <Label className="block text-sm font-medium text-slate-700 mb-1">Group ID</Label>
                  <Input
                    type="text"
                    value={groupId}
                    onChange={(e) => setGroupId(e.target.value)}
                    placeholder="Group ID or path"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <Label className="block text-sm font-medium text-slate-700 mb-1">GitLab Token</Label>
                  <Input
                    type="password"
                    value={gitlabToken}
                    onChange={(e) => setGitlabToken(e.target.value)}
                    placeholder="glpat-..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    type="button"
                    onPress={() => setIsDialogOpen(false)}
                    className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    onClick={handleGitLabImport}
                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                  >
                    Start Import
                  </Button>
                </div>
              </form>
            )}

            {/* Bitbucket Tab */}
            {activeTab === 'bitbucket' && (
              <form onSubmit={handleBitbucketImport} className="space-y-4">
                <div>
                  <Label className="block text-sm font-medium text-slate-700 mb-1">Bitbucket Username</Label>
                  <Input
                    type="text"
                    value={bbUser}
                    onChange={(e) => setBbUser(e.target.value)}
                    placeholder="Username"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <Label className="block text-sm font-medium text-slate-700 mb-1">Bitbucket Password/Token</Label>
                  <Input
                    type="password"
                    value={bbPassword}
                    onChange={(e) => setBbPassword(e.target.value)}
                    placeholder="Password or app password"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <Label className="block text-sm font-medium text-slate-700 mb-1">Team Slug</Label>
                  <Input
                    type="text"
                    value={teamSlug}
                    onChange={(e) => setTeamSlug(e.target.value)}
                    placeholder="Team slug"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    type="button"
                    onPress={() => setIsDialogOpen(false)}
                    className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    onClick={handleBitbucketImport}
                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                  >
                    Start Import
                  </Button>
                </div>
              </form>
            )}

            {/* Files Tab */}
            {activeTab === 'files' && (
              <div className="space-y-4">
                {/* JSON */}
                <div>
                  <Label className="block text-sm font-medium text-slate-700 mb-2">JSON File</Label>
                  <input
                    id="json-input"
                    type="file"
                    accept=".json"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                  <Button
                    onPress={(e: any) => handleFileImport(e, 'json')}
                    className="mt-2 w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                  >
                    <UploadIcon className="w-4 h-4 inline mr-2" />
                    Upload JSON
                  </Button>
                </div>

                {/* CSV */}
                <div>
                  <Label className="block text-sm font-medium text-slate-700 mb-2">CSV File</Label>
                  <input
                    id="csv-input"
                    type="file"
                    accept=".csv"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                  <Button
                    onPress={(e: any) => handleFileImport(e, 'csv')}
                    className="mt-2 w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                  >
                    <UploadIcon className="w-4 h-4 inline mr-2" />
                    Upload CSV
                  </Button>
                </div>

                {/* OPML */}
                <div>
                  <Label className="block text-sm font-medium text-slate-700 mb-2">OPML File</Label>
                  <input
                    id="opml-input"
                    type="file"
                    accept=".opml"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                  <Button
                    onPress={(e: any) => handleFileImport(e, 'opml')}
                    className="mt-2 w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                  >
                    <UploadIcon className="w-4 h-4 inline mr-2" />
                    Upload OPML
                  </Button>
                </div>

                <div className="pt-4">
                  <Button
                    onPress={() => setIsDialogOpen(false)}
                    className="w-full px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors"
                  >
                    Close
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
        </div>
      )}
    </div>
  );
}
