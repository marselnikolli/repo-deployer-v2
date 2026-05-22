import { useState, useEffect } from 'react'
import {
  Github, LogOut, LogIn, RefreshCw, AlertCircle, CheckCircle2, Clock,
  User, Lock, Key, Eye, EyeOff, Copy, Trash2, Plus, Shield, Mail,
  Edit2, Check, X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '@/contexts/AuthContext'
import api from '@/api/client'
import { cx } from '@/utils/cx'

interface FullUser {
  id: number
  email: string
  name: string | null
  avatar_url: string | null
  auth_provider: string
  is_verified: boolean
  is_active: boolean
  created_at: string
  last_login: string | null
}

interface ApiKeyItem {
  name: string
  created_at: string | null
  preview: string
}

interface GitHubBookmarkStatus {
  connected: boolean
  username?: string
  sync_status: string
  last_sync?: string
  repo_created: boolean
}

export function UserSettingsPage() {
  const { accessToken } = useAuth()

  // ── Full user profile ──
  const [profile, setProfile] = useState<FullUser | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)

  // ── Name editing ──
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const [nameSaving, setNameSaving] = useState(false)

  // ── Password change ──
  const [pwCurrent, setPwCurrent] = useState('')
  const [pwNew, setPwNew] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [showPwCurrent, setShowPwCurrent] = useState(false)
  const [showPwNew, setShowPwNew] = useState(false)
  const [pwSaving, setPwSaving] = useState(false)

  // ── API keys ──
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([])
  const [apiKeysLoading, setApiKeysLoading] = useState(true)
  const [newKeyName, setNewKeyName] = useState('')
  const [creatingKey, setCreatingKey] = useState(false)
  const [justCreatedKey, setJustCreatedKey] = useState<string | null>(null)

  // ── GitHub Bookmarks ──
  const [gitHubStatus, setGitHubStatus] = useState<GitHubBookmarkStatus | null>(null)
  const [githubLoading, setGithubLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    if (accessToken) {
      loadProfile()
      loadApiKeys()
      loadGitHubStatus()
    }
  }, [accessToken])

  // ── Profile ──
  const loadProfile = async () => {
    try {
      setProfileLoading(true)
      const res = await api.get('/auth/me')
      setProfile(res.data)
      setNameValue(res.data.name || '')
    } catch {
      toast.error('Failed to load profile')
    } finally {
      setProfileLoading(false)
    }
  }

  const handleSaveName = async () => {
    if (!nameValue.trim()) return
    try {
      setNameSaving(true)
      const res = await api.patch('/auth/me', { name: nameValue.trim() })
      setProfile(res.data)
      setEditingName(false)
      toast.success('Name updated')
    } catch {
      toast.error('Failed to update name')
    } finally {
      setNameSaving(false)
    }
  }

  const handleCancelNameEdit = () => {
    setNameValue(profile?.name || '')
    setEditingName(false)
  }

  // ── Password ──
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pwNew !== pwConfirm) {
      toast.error('New passwords do not match')
      return
    }
    if (pwNew.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    try {
      setPwSaving(true)
      await api.post('/auth/change-password', {
        current_password: pwCurrent,
        new_password: pwNew,
      })
      toast.success('Password updated')
      setPwCurrent('')
      setPwNew('')
      setPwConfirm('')
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to change password')
    } finally {
      setPwSaving(false)
    }
  }

  // ── API Keys ──
  const loadApiKeys = async () => {
    try {
      setApiKeysLoading(true)
      const res = await api.get('/auth/api-keys')
      setApiKeys(res.data)
    } catch {
      // Non-fatal — user may not have any keys
      setApiKeys([])
    } finally {
      setApiKeysLoading(false)
    }
  }

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setCreatingKey(true)
      const res = await api.post('/auth/api-keys', { name: newKeyName.trim() || 'API Key' })
      setJustCreatedKey(res.data.key)
      setNewKeyName('')
      await loadApiKeys()
      toast.success('API key created — copy it now, it won\'t be shown again')
    } catch {
      toast.error('Failed to create API key')
    } finally {
      setCreatingKey(false)
    }
  }

  const handleRevokeKey = async (preview: string) => {
    // We don't have the full key to pass — show a hint to the user that they need to
    // use the full key value. Since we only store preview, we ask for confirmation.
    if (!window.confirm(`Revoke API key ending in ${preview.slice(-8)}?`)) return
    toast.error('To revoke a specific key, use the API directly with the full key value.')
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success('Copied to clipboard'))
  }

  // ── GitHub Bookmarks ──
  const loadGitHubStatus = async () => {
    try {
      const response = await fetch('/api/github-bookmarks/status', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })
      if (response.ok) setGitHubStatus(await response.json())
    } catch { /* non-fatal */ }
  }

  const handleGitHubConnect = async () => {
    const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID
    if (!clientId) { toast.error('GitHub client ID not configured'); return }
    setGithubLoading(true)
    const redirectUri = `${window.location.origin}/auth/github/bookmarks`
    window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=repo&state=bookmarks`
  }

  const handleGitHubDisconnect = async () => {
    try {
      setGithubLoading(true)
      const res = await fetch('/api/github-bookmarks/disconnect', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })
      if (res.ok) {
        toast.success('GitHub account disconnected')
        await loadGitHubStatus()
      } else {
        toast.error('Failed to disconnect')
      }
    } catch { toast.error('Failed to disconnect') } finally { setGithubLoading(false) }
  }

  const handleGitHubSync = async () => {
    try {
      setSyncing(true)
      const res = await fetch('/api/github-bookmarks/sync', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })
      if (res.ok) {
        const data = await res.json()
        toast.success(data.message || 'Bookmarks synced')
        await loadGitHubStatus()
      } else {
        const err = await res.json()
        toast.error(err.detail || 'Sync failed')
      }
    } catch { toast.error('Sync failed') } finally { setSyncing(false) }
  }

  const formatDate = (dt?: string | null) => {
    if (!dt) return 'Never'
    return new Date(dt).toLocaleString()
  }

  if (profileLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--color-brand-500)] border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h2 className="text-[length:var(--text-display-xs)] font-semibold text-[var(--color-fg-primary)]">
        Settings
      </h2>

      {/* ── Profile ── */}
      <section className="bg-[var(--color-bg-primary)] rounded-[var(--radius-xl)] border border-[var(--color-border-secondary)] shadow-[var(--shadow-sm)] overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)]">
          <User className="size-5 text-[var(--color-brand-600)]" />
          <h3 className="text-[length:var(--text-md)] font-semibold text-[var(--color-fg-primary)]">Profile</h3>
        </div>
        <div className="p-6 space-y-5">
          {/* Avatar + name */}
          <div className="flex items-center gap-4">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="avatar" className="w-14 h-14 rounded-full border border-[var(--color-border-secondary)]" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-[var(--color-brand-100)] flex items-center justify-center text-[var(--color-brand-700)] text-xl font-bold">
                {(profile?.name || profile?.email || '?')[0].toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              {editingName ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={nameValue}
                    onChange={e => setNameValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') handleCancelNameEdit() }}
                    className="px-3 py-1.5 text-[length:var(--text-sm)] border border-[var(--color-border-primary)] rounded-[var(--radius-md)] bg-[var(--color-bg-primary)] text-[var(--color-fg-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-500)] w-48"
                    placeholder="Your name"
                  />
                  <button onClick={handleSaveName} disabled={nameSaving} className="p-1.5 rounded-[var(--radius-md)] bg-[var(--color-brand-600)] text-white hover:bg-[var(--color-brand-700)] disabled:opacity-50 transition-colors">
                    <Check className="size-4" />
                  </button>
                  <button onClick={handleCancelNameEdit} className="p-1.5 rounded-[var(--radius-md)] text-[var(--color-fg-tertiary)] hover:text-[var(--color-fg-primary)] transition-colors">
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-[length:var(--text-md)] font-semibold text-[var(--color-fg-primary)]">
                    {profile?.name || <span className="text-[var(--color-fg-tertiary)] font-normal italic">No name set</span>}
                  </span>
                  <button onClick={() => setEditingName(true)} className="p-1 rounded text-[var(--color-fg-quaternary)] hover:text-[var(--color-fg-secondary)] transition-colors">
                    <Edit2 className="size-3.5" />
                  </button>
                </div>
              )}
              <p className="text-[length:var(--text-sm)] text-[var(--color-fg-tertiary)] mt-0.5">{profile?.email}</p>
            </div>
          </div>

          {/* Meta badges */}
          <div className="flex flex-wrap gap-2 pt-1">
            <span className={cx(
              'inline-flex items-center gap-1.5 px-2.5 py-1 text-[length:var(--text-xs)] font-medium rounded-[var(--radius-md)]',
              profile?.is_verified
                ? 'bg-[var(--color-success-50)] text-[var(--color-success-700)] border border-[var(--color-success-200)]'
                : 'bg-[var(--color-warning-50)] text-[var(--color-warning-700)] border border-[var(--color-warning-200)]'
            )}>
              {profile?.is_verified ? <CheckCircle2 className="size-3.5" /> : <AlertCircle className="size-3.5" />}
              {profile?.is_verified ? 'Email verified' : 'Email not verified'}
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[length:var(--text-xs)] font-medium rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] text-[var(--color-fg-secondary)] border border-[var(--color-border-secondary)]">
              <Shield className="size-3.5" />
              {profile?.auth_provider === 'local' ? 'Email/password' : profile?.auth_provider}
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[length:var(--text-xs)] font-medium rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] text-[var(--color-fg-secondary)] border border-[var(--color-border-secondary)]">
              <Mail className="size-3.5" />
              Member since {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : '—'}
            </span>
            {profile?.last_login && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[length:var(--text-xs)] font-medium rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] text-[var(--color-fg-secondary)] border border-[var(--color-border-secondary)]">
                <Clock className="size-3.5" />
                Last login {formatDate(profile.last_login)}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* ── Change Password (local only) ── */}
      {profile?.auth_provider === 'local' && (
        <section className="bg-[var(--color-bg-primary)] rounded-[var(--radius-xl)] border border-[var(--color-border-secondary)] shadow-[var(--shadow-sm)] overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)]">
            <Lock className="size-5 text-[var(--color-brand-600)]" />
            <h3 className="text-[length:var(--text-md)] font-semibold text-[var(--color-fg-primary)]">Change Password</h3>
          </div>
          <form onSubmit={handleChangePassword} className="p-6 space-y-4">
            <div>
              <label className="block text-[length:var(--text-sm)] font-medium text-[var(--color-fg-secondary)] mb-1.5">Current password</label>
              <div className="relative">
                <input
                  type={showPwCurrent ? 'text' : 'password'}
                  value={pwCurrent}
                  onChange={e => setPwCurrent(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-[length:var(--text-sm)] border border-[var(--color-border-primary)] rounded-[var(--radius-md)] bg-[var(--color-bg-primary)] text-[var(--color-fg-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-500)] pr-10"
                  placeholder="••••••••"
                />
                <button type="button" onClick={() => setShowPwCurrent(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-fg-quaternary)] hover:text-[var(--color-fg-secondary)]">
                  {showPwCurrent ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[length:var(--text-sm)] font-medium text-[var(--color-fg-secondary)] mb-1.5">New password</label>
                <div className="relative">
                  <input
                    type={showPwNew ? 'text' : 'password'}
                    value={pwNew}
                    onChange={e => setPwNew(e.target.value)}
                    required
                    minLength={8}
                    className="w-full px-3 py-2 text-[length:var(--text-sm)] border border-[var(--color-border-primary)] rounded-[var(--radius-md)] bg-[var(--color-bg-primary)] text-[var(--color-fg-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-500)] pr-10"
                    placeholder="Min 8 characters"
                  />
                  <button type="button" onClick={() => setShowPwNew(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-fg-quaternary)] hover:text-[var(--color-fg-secondary)]">
                    {showPwNew ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-[length:var(--text-sm)] font-medium text-[var(--color-fg-secondary)] mb-1.5">Confirm new password</label>
                <input
                  type="password"
                  value={pwConfirm}
                  onChange={e => setPwConfirm(e.target.value)}
                  required
                  className={cx(
                    'w-full px-3 py-2 text-[length:var(--text-sm)] border rounded-[var(--radius-md)] bg-[var(--color-bg-primary)] text-[var(--color-fg-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-500)]',
                    pwConfirm && pwNew !== pwConfirm
                      ? 'border-[var(--color-error-400)]'
                      : 'border-[var(--color-border-primary)]'
                  )}
                  placeholder="Repeat new password"
                />
              </div>
            </div>
            {pwConfirm && pwNew !== pwConfirm && (
              <p className="text-[length:var(--text-xs)] text-[var(--color-error-600)]">Passwords do not match</p>
            )}
            <div className="pt-1">
              <button
                type="submit"
                disabled={pwSaving || !pwCurrent || !pwNew || pwNew !== pwConfirm}
                className="px-4 py-2 text-[length:var(--text-sm)] font-medium text-white bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] disabled:opacity-50 rounded-[var(--radius-md)] transition-colors"
              >
                {pwSaving ? 'Saving…' : 'Update password'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* ── API Keys ── */}
      <section className="bg-[var(--color-bg-primary)] rounded-[var(--radius-xl)] border border-[var(--color-border-secondary)] shadow-[var(--shadow-sm)] overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)]">
          <Key className="size-5 text-[var(--color-brand-600)]" />
          <h3 className="text-[length:var(--text-md)] font-semibold text-[var(--color-fg-primary)]">API Keys</h3>
          <span className="ml-auto text-[length:var(--text-xs)] text-[var(--color-fg-tertiary)]">{apiKeys.length} key{apiKeys.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="p-6 space-y-4">
          {/* Just-created key banner */}
          {justCreatedKey && (
            <div className="bg-[var(--color-success-50)] border border-[var(--color-success-200)] rounded-[var(--radius-lg)] p-4">
              <p className="text-[length:var(--text-sm)] font-medium text-[var(--color-success-800)] mb-2">
                Key created — copy it now. It won't be shown again.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-success-300)] rounded-[var(--radius-md)] text-[length:var(--text-xs)] font-mono text-[var(--color-fg-primary)] truncate">
                  {justCreatedKey}
                </code>
                <button
                  onClick={() => copyToClipboard(justCreatedKey)}
                  className="p-2 rounded-[var(--radius-md)] bg-[var(--color-success-100)] text-[var(--color-success-700)] hover:bg-[var(--color-success-200)] transition-colors flex-shrink-0"
                >
                  <Copy className="size-4" />
                </button>
                <button
                  onClick={() => setJustCreatedKey(null)}
                  className="p-2 rounded-[var(--radius-md)] text-[var(--color-success-600)] hover:bg-[var(--color-success-100)] transition-colors flex-shrink-0"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
          )}

          {/* Existing keys */}
          {apiKeysLoading ? (
            <div className="flex justify-center py-4">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-[var(--color-brand-500)] border-t-transparent" />
            </div>
          ) : apiKeys.length === 0 ? (
            <p className="text-[length:var(--text-sm)] text-[var(--color-fg-tertiary)] py-2">No API keys yet.</p>
          ) : (
            <div className="divide-y divide-[var(--color-border-secondary)] border border-[var(--color-border-secondary)] rounded-[var(--radius-lg)] overflow-hidden">
              {apiKeys.map((key, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 bg-[var(--color-bg-primary)]">
                  <Key className="size-4 text-[var(--color-fg-quaternary)] flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[length:var(--text-sm)] font-medium text-[var(--color-fg-primary)]">{key.name}</p>
                    <p className="text-[length:var(--text-xs)] text-[var(--color-fg-tertiary)]">
                      <code className="font-mono">{key.preview}</code>
                      {key.created_at && <span className="ml-2">· Created {new Date(key.created_at).toLocaleDateString()}</span>}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRevokeKey(key.preview)}
                    className="p-1.5 rounded-[var(--radius-md)] text-[var(--color-error-500)] hover:bg-[var(--color-error-50)] transition-colors flex-shrink-0"
                    title="Revoke key"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Create new key */}
          <form onSubmit={handleCreateKey} className="flex items-center gap-2 pt-2">
            <input
              value={newKeyName}
              onChange={e => setNewKeyName(e.target.value)}
              placeholder="Key name (optional)"
              className="flex-1 px-3 py-2 text-[length:var(--text-sm)] border border-[var(--color-border-primary)] rounded-[var(--radius-md)] bg-[var(--color-bg-primary)] text-[var(--color-fg-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-500)]"
            />
            <button
              type="submit"
              disabled={creatingKey}
              className="px-4 py-2 text-[length:var(--text-sm)] font-medium text-white bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] disabled:opacity-50 rounded-[var(--radius-md)] transition-colors flex items-center gap-2 flex-shrink-0"
            >
              <Plus className="size-4" />
              {creatingKey ? 'Creating…' : 'New key'}
            </button>
          </form>
        </div>
      </section>

      {/* ── GitHub Bookmarks ── */}
      <section className="bg-[var(--color-bg-primary)] rounded-[var(--radius-xl)] border border-[var(--color-border-secondary)] shadow-[var(--shadow-sm)] overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)]">
          <Github className="size-5 text-[var(--color-brand-600)]" />
          <div>
            <h3 className="text-[length:var(--text-md)] font-semibold text-[var(--color-fg-primary)]">GitHub Bookmarks</h3>
            <p className="text-[length:var(--text-xs)] text-[var(--color-fg-tertiary)]">Sync your repositories to a private GitHub repo</p>
          </div>
        </div>

        <div className="p-6">
          {gitHubStatus?.connected ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 bg-[var(--color-success-50)] border border-[var(--color-success-200)] rounded-[var(--radius-lg)]">
                <CheckCircle2 className="size-5 text-[var(--color-success-600)] flex-shrink-0" />
                <div>
                  <p className="text-[length:var(--text-sm)] font-medium text-[var(--color-success-800)]">
                    Connected as <span className="font-bold">@{gitHubStatus.username}</span>
                  </p>
                  <p className="text-[length:var(--text-xs)] text-[var(--color-success-700)]">
                    Syncing to <code className="bg-[var(--color-success-100)] px-1 rounded">git-bookmark</code> repository
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 bg-[var(--color-bg-secondary)] rounded-[var(--radius-lg)] border border-[var(--color-border-secondary)]">
                  <p className="text-[length:var(--text-xs)] text-[var(--color-fg-tertiary)] mb-1">Sync status</p>
                  <div className="flex items-center gap-2">
                    {gitHubStatus.sync_status === 'synced' ? <CheckCircle2 className="size-4 text-[var(--color-success-500)]" /> :
                     gitHubStatus.sync_status === 'failed' ? <AlertCircle className="size-4 text-[var(--color-error-500)]" /> :
                     <Clock className="size-4 text-[var(--color-warning-500)]" />}
                    <span className="text-[length:var(--text-sm)] font-medium text-[var(--color-fg-primary)] capitalize">{gitHubStatus.sync_status}</span>
                  </div>
                </div>
                <div className="p-3 bg-[var(--color-bg-secondary)] rounded-[var(--radius-lg)] border border-[var(--color-border-secondary)]">
                  <p className="text-[length:var(--text-xs)] text-[var(--color-fg-tertiary)] mb-1">Last synced</p>
                  <p className="text-[length:var(--text-sm)] font-medium text-[var(--color-fg-primary)]">{formatDate(gitHubStatus.last_sync)}</p>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleGitHubSync}
                  disabled={syncing || githubLoading}
                  className="flex-1 px-4 py-2 text-[length:var(--text-sm)] font-medium text-white bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] disabled:opacity-50 rounded-[var(--radius-md)] transition-colors flex items-center justify-center gap-2"
                >
                  <RefreshCw className={cx('size-4', syncing && 'animate-spin')} />
                  {syncing ? 'Syncing…' : 'Sync now'}
                </button>
                <button
                  onClick={handleGitHubDisconnect}
                  disabled={githubLoading || syncing}
                  className="px-4 py-2 text-[length:var(--text-sm)] font-medium text-[var(--color-error-700)] bg-[var(--color-error-50)] hover:bg-[var(--color-error-100)] border border-[var(--color-error-200)] disabled:opacity-50 rounded-[var(--radius-md)] transition-colors flex items-center gap-2"
                >
                  <LogOut className="size-4" />
                  Disconnect
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-[length:var(--text-sm)] text-[var(--color-fg-tertiary)]">
                Connect your GitHub account to sync your repository library to a private <code className="bg-[var(--color-bg-secondary)] px-1.5 py-0.5 rounded text-[var(--color-fg-secondary)]">git-bookmark</code> repository.
              </p>
              <div className="bg-[var(--color-brand-50)] border border-[var(--color-brand-200)] rounded-[var(--radius-lg)] p-4 text-[length:var(--text-sm)] text-[var(--color-brand-800)]">
                <p className="font-medium mb-1">What happens when you connect</p>
                <ul className="list-disc list-inside space-y-1 text-[var(--color-brand-700)]">
                  <li>A private <code className="bg-[var(--color-brand-100)] px-1 rounded">git-bookmark</code> repo will be created</li>
                  <li>Your bookmarks will be merged with GitHub data</li>
                  <li>You can manually sync anytime</li>
                </ul>
              </div>
              <button
                onClick={handleGitHubConnect}
                disabled={githubLoading}
                className="w-full px-4 py-2.5 text-[length:var(--text-sm)] font-medium text-white bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] disabled:opacity-50 rounded-[var(--radius-md)] transition-colors flex items-center justify-center gap-2"
              >
                <LogIn className="size-4" />
                {githubLoading ? 'Connecting…' : 'Connect GitHub Account'}
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
