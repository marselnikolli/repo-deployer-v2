import { useState, useEffect } from 'react'
import { Github, LogOut, LogIn, RefreshCw, AlertCircle, CheckCircle2, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '@/contexts/AuthContext'

interface GitHubBookmarkStatus {
  connected: boolean
  username?: string
  sync_status: string
  last_sync?: string
  repo_created: boolean
}

export function UserSettingsPage() {
  const { user, accessToken } = useAuth()
  const [gitHubStatus, setGitHubStatus] = useState<GitHubBookmarkStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    if (accessToken) {
      loadGitHubStatus()
    }
  }, [accessToken])

  const loadGitHubStatus = async () => {
    try {
      const response = await fetch('/api/github-bookmarks/status', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const data = await response.json()
        setGitHubStatus(data)
      }
    } catch (error) {
      console.error('Error loading GitHub status:', error)
    }
  }

  const handleGitHubConnect = async () => {
    try {
      setLoading(true)
      
      // Redirect to GitHub OAuth
      const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID
      const redirectUri = `${window.location.origin}/auth/github/bookmarks`
      const scope = 'repo'
      
      if (!clientId) {
        toast.error('GitHub client ID not configured')
        return
      }

      const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=bookmarks`
      window.location.href = authUrl
    } catch (error) {
      console.error('Error connecting GitHub:', error)
      toast.error('Failed to connect GitHub account')
    } finally {
      setLoading(false)
    }
  }

  const handleDisconnect = async () => {
    try {
      setLoading(true)
      
      const response = await fetch('/api/github-bookmarks/disconnect', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        toast.success('GitHub account disconnected')
        setGitHubStatus(null)
        await loadGitHubStatus()
      } else {
        toast.error('Failed to disconnect GitHub account')
      }
    } catch (error) {
      console.error('Error disconnecting:', error)
      toast.error('Failed to disconnect GitHub account')
    } finally {
      setLoading(false)
    }
  }

  const handleSync = async () => {
    try {
      setSyncing(true)
      
      const response = await fetch('/api/github-bookmarks/sync', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const data = await response.json()
        toast.success(data.message || 'Bookmarks synced successfully')
        await loadGitHubStatus()
      } else {
        const error = await response.json()
        toast.error(error.detail || 'Failed to sync bookmarks')
      }
    } catch (error) {
      console.error('Error syncing:', error)
      toast.error('Failed to sync bookmarks')
    } finally {
      setSyncing(false)
    }
  }

  const getSyncStatusIcon = (status: string) => {
    switch (status) {
      case 'synced':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />
      case 'syncing':
      case 'pending':
        return <Clock className="w-5 h-5 text-yellow-500" />
      case 'failed':
        return <AlertCircle className="w-5 h-5 text-red-500" />
      default:
        return <Clock className="w-5 h-5 text-gray-400" />
    }
  }

  const formatLastSync = (lastSync?: string) => {
    if (!lastSync) return 'Never'
    const date = new Date(lastSync)
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString()
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-secondary)] py-8">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-[var(--color-bg-primary)] rounded-lg border border-[var(--color-border-secondary)] shadow-lg overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-[var(--color-brand-600)] to-[var(--color-brand-700)] px-8 py-6 text-white">
            <h1 className="text-3xl font-bold">User Settings</h1>
            <p className="text-white/80 mt-2">Manage your account and integrations</p>
          </div>

          {/* Content */}
          <div className="p-8">
            {/* GitHub Bookmarks Section */}
            <div className="border border-[var(--color-border-secondary)] rounded-lg p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Github className="w-8 h-8 text-[var(--color-brand-600)]" />
                  <div>
                    <h2 className="text-2xl font-semibold text-[var(--color-fg-primary)]">
                      GitHub Profile & Bookmarks
                    </h2>
                    <p className="text-sm text-[var(--color-fg-tertiary)] mt-1">
                      Sync your imported repositories to a private GitHub repository
                    </p>
                  </div>
                </div>
              </div>

              {gitHubStatus?.connected ? (
                // Connected state
                <div className="space-y-4">
                  <div className="bg-[var(--color-bg-secondary)] rounded p-4 border border-green-200 dark:border-green-800">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                      <div className="flex-1">
                        <p className="font-semibold text-[var(--color-fg-primary)]">
                          Connected: <span className="text-green-600">@{gitHubStatus.username}</span>
                        </p>
                        <p className="text-sm text-[var(--color-fg-tertiary)] mt-1">
                          Your bookmarks are synced with the <code className="bg-[var(--color-bg-primary)] px-2 py-1 rounded">git-bookmark</code> repository
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Sync Status */}
                  <div className="bg-[var(--color-bg-secondary)] rounded p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[var(--color-fg-secondary)]">Sync Status</span>
                      <div className="flex items-center gap-2">
                        {getSyncStatusIcon(gitHubStatus.sync_status)}
                        <span className="text-sm font-medium capitalize text-[var(--color-fg-primary)]">
                          {gitHubStatus.sync_status}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-[var(--color-fg-tertiary)]">
                      Last synced: {formatLastSync(gitHubStatus.last_sync)}
                    </p>
                  </div>

                  {/* Repository Status */}
                  <div className="bg-[var(--color-bg-secondary)] rounded p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--color-fg-secondary)]">Repository Status</span>
                      <span className="text-sm font-medium">
                        {gitHubStatus.repo_created ? (
                          <span className="text-green-600">Created & Active</span>
                        ) : (
                          <span className="text-yellow-600">Will be created on first sync</span>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={handleSync}
                      disabled={syncing || loading}
                      className="flex-1 bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition"
                    >
                      <RefreshCw className={`w-5 h-5 ${syncing ? 'animate-spin' : ''}`} />
                      {syncing ? 'Syncing...' : 'Sync Now'}
                    </button>
                    <button
                      onClick={handleDisconnect}
                      disabled={loading || syncing}
                      className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition"
                    >
                      <LogOut className="w-5 h-5" />
                      Disconnect
                    </button>
                  </div>
                </div>
              ) : (
                // Disconnected state
                <div className="bg-[var(--color-bg-secondary)] rounded p-6 border-2 border-dashed border-[var(--color-border-secondary)]">
                  <div className="text-center mb-6">
                    <Github className="w-12 h-12 text-[var(--color-fg-tertiary)] mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-[var(--color-fg-primary)] mb-2">
                      Not Connected
                    </h3>
                    <p className="text-[var(--color-fg-tertiary)] mb-4">
                      Connect your GitHub account to automatically sync your bookmarked repositories to a private repository. 
                      This keeps all your imported repositories in sync across devices and backup.
                    </p>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-4 mb-6">
                    <div className="flex gap-3">
                      <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-blue-800 dark:text-blue-200">
                        <p className="font-semibold mb-1">What happens when you connect?</p>
                        <ul className="list-disc list-inside space-y-1">
                          <li>A private <code className="bg-white dark:bg-black px-1 rounded text-xs">git-bookmark</code> repository will be created</li>
                          <li>Your current bookmarks will be merged with GitHub data</li>
                          <li>Automatic syncing will occur daily at 2:00 AM UTC</li>
                          <li>You can manually trigger syncs anytime</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleGitHubConnect}
                    disabled={loading}
                    className="w-full bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] disabled:opacity-50 text-white font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition"
                  >
                    <LogIn className="w-5 h-5" />
                    {loading ? 'Connecting...' : 'Connect GitHub Account'}
                  </button>
                </div>
              )}
            </div>

            {/* Additional Info */}
            <div className="mt-8 pt-8 border-t border-[var(--color-border-secondary)]">
              <h3 className="text-lg font-semibold text-[var(--color-fg-primary)] mb-4">Account Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[var(--color-bg-secondary)] rounded p-4">
                  <p className="text-sm text-[var(--color-fg-tertiary)] mb-1">Email</p>
                  <p className="font-semibold text-[var(--color-fg-primary)]">{user?.email}</p>
                </div>
                <div className="bg-[var(--color-bg-secondary)] rounded p-4">
                  <p className="text-sm text-[var(--color-fg-tertiary)] mb-1">Name</p>
                  <p className="font-semibold text-[var(--color-fg-primary)]">{user?.name || 'Not set'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
