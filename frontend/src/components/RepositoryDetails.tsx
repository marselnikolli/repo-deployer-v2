import { useState, useEffect } from 'react'
import {
  X,
  ExternalLink,
  GitFork,
  Star,
  Eye,
  Clock,
  Tag,
  AlertCircle,
  CheckCircle,
  Archive,
  RefreshCw,
  Copy,
  Server,
  Download,
} from 'lucide-react'
import { repositoryApi } from '@/api/client'
import { cx } from '@/utils/cx'
import toast from 'react-hot-toast'

interface Repository {
  id: number
  name: string
  title: string
  url: string
  category: string
  description?: string
  cloned: boolean
  deployed: boolean
  created_at?: string
  updated_at?: string
  stars?: number
  forks?: number
  watchers?: number
  language?: string
  languages?: Record<string, number>
  topics?: string[]
  license?: string
  archived?: boolean
  is_fork?: boolean
  open_issues?: number
  default_branch?: string
  github_created_at?: string
  github_updated_at?: string
  github_pushed_at?: string
  last_metadata_sync?: string
  health_status?: string
  last_health_check?: string
  tags?: Array<{ id: number; name: string; color: string }>
}

interface RepositoryDetailsProps {
  repository: Repository
  onClose: () => void
  onUpdate?: () => void
}

export function RepositoryDetails({ repository, onClose, onUpdate }: RepositoryDetailsProps) {
  const [repo, setRepo] = useState<Repository>(repository)
  const [syncing, setSyncing] = useState(false)
  const [cloning, setCloning] = useState(false)

  const handleSyncMetadata = async () => {
    try {
      setSyncing(true)
      const response = await repositoryApi.syncMetadata(repo.id)
      if (response.data.success) {
        toast.success('Metadata synced successfully')
        // Refresh repository data
        const updated = await repositoryApi.get(repo.id)
        setRepo(updated.data)
        onUpdate?.()
      } else {
        toast.error('Failed to sync metadata')
      }
    } catch {
      toast.error('Failed to sync metadata')
    } finally {
      setSyncing(false)
    }
  }

  const handleClone = async () => {
    try {
      setCloning(true)
      await repositoryApi.clone(repo.id)
      toast.success(`Cloning ${repo.name}...`)
    } catch {
      toast.error('Failed to start clone')
    } finally {
      setCloning(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const formatNumber = (num?: number) => {
    if (num === undefined || num === null) return '0'
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
    return num.toString()
  }

  const getHealthBadge = () => {
    const status = repo.health_status || 'unknown'
    const badges: Record<string, { bg: string; text: string; icon: typeof CheckCircle }> = {
      healthy: { bg: 'bg-[var(--color-green-bg)]', text: 'text-[var(--color-green-text)]', icon: CheckCircle },
      archived: { bg: 'bg-[var(--color-yellow-bg)]', text: 'text-[var(--color-yellow-text)]', icon: Archive },
      not_found: { bg: 'bg-[var(--color-red-bg)]', text: 'text-[var(--color-red-text)]', icon: AlertCircle },
      unknown: { bg: 'bg-[var(--color-gray-100)] dark:bg-[var(--color-gray-900)]', text: 'text-[var(--color-gray-700)] dark:text-[var(--color-gray-300)]', icon: AlertCircle},
    }
    const badge = badges[status] || badges.unknown
    const Icon = badge.icon
    return (
      <span className={cx('inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium', badge.bg, badge.text)}>
        <Icon className="size-3" />
        {status}
      </span>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-[var(--color-bg-primary)] rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-secondary)]">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-[var(--color-fg-primary)] truncate">{repo.name}</h2>
            <p className="text-sm text-[var(--color-fg-tertiary)] truncate">{repo.title}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors"
          >
            <X className="size-5 text-[var(--color-fg-tertiary)]" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)] space-y-6">
          {/* URL and Actions */}
          <div className="flex items-center gap-3">
            <a
              href={repo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center gap-2 px-3 py-2 bg-[var(--color-bg-secondary)] rounded-lg text-sm text-[var(--color-brand-600)] hover:text-[var(--color-brand-700)] truncate"
            >
              <ExternalLink className="size-4 flex-shrink-0" />
              {repo.url}
            </a>
            <button
              onClick={() => copyToClipboard(repo.url)}
              className="p-2 rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors"
              title="Copy URL"
            >
              <Copy className="size-4 text-[var(--color-fg-tertiary)]" />
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-[var(--color-bg-secondary)] rounded-lg p-3 text-center">
              <Star className="size-5 mx-auto mb-1 text-[var(--color-yellow-icon)]" />
              <div className="text-lg font-semibold text-[var(--color-fg-primary)]">{formatNumber(repo.stars)}</div>
              <div className="text-xs text-[var(--color-fg-tertiary)]">Stars</div>
            </div>
            <div className="bg-[var(--color-bg-secondary)] rounded-lg p-3 text-center">
              <GitFork className="size-5 mx-auto mb-1 text-[var(--color-blue-icon)]" />
              <div className="text-lg font-semibold text-[var(--color-fg-primary)]">{formatNumber(repo.forks)}</div>
              <div className="text-xs text-[var(--color-fg-tertiary)]">Forks</div>
            </div>
            <div className="bg-[var(--color-bg-secondary)] rounded-lg p-3 text-center">
              <Eye className="size-5 mx-auto mb-1 text-[var(--color-green-icon)]" />
              <div className="text-lg font-semibold text-[var(--color-fg-primary)]">{formatNumber(repo.watchers)}</div>
              <div className="text-xs text-[var(--color-fg-tertiary)]">Watchers</div>
            </div>
            <div className="bg-[var(--color-bg-secondary)] rounded-lg p-3 text-center">
              <AlertCircle className="size-5 mx-auto mb-1 text-[var(--color-orange-icon)]" />
              <div className="text-lg font-semibold text-[var(--color-fg-primary)]">{formatNumber(repo.open_issues)}</div>
              <div className="text-xs text-[var(--color-fg-tertiary)]">Issues</div>
            </div>
          </div>

          {/* Description */}
          {repo.description && (
            <div>
              <h3 className="text-sm font-medium text-[var(--color-fg-secondary)] mb-2">Description</h3>
              <p className="text-sm text-[var(--color-fg-primary)]">{repo.description}</p>
            </div>
          )}

          {/* Metadata Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-medium text-[var(--color-fg-secondary)] mb-2">Category</h3>
              <span className="inline-block px-2 py-1 bg-[var(--color-brand-50)] text-[var(--color-brand-700)] rounded-md text-sm capitalize">
                {repo.category?.replace('_', ' ')}
              </span>
            </div>
            <div>
              <h3 className="text-sm font-medium text-[var(--color-fg-secondary)] mb-2">Language</h3>
              <span className="text-sm text-[var(--color-fg-primary)]">{repo.language || '—'}</span>
            </div>
            <div>
              <h3 className="text-sm font-medium text-[var(--color-fg-secondary)] mb-2">License</h3>
              <span className="text-sm text-[var(--color-fg-primary)]">{repo.license || '—'}</span>
            </div>
            <div>
              <h3 className="text-sm font-medium text-[var(--color-fg-secondary)] mb-2">Default Branch</h3>
              <span className="text-sm text-[var(--color-fg-primary)]">{repo.default_branch || 'main'}</span>
            </div>
          </div>

          {/* Topics */}
          {repo.topics && repo.topics.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-[var(--color-fg-secondary)] mb-2">Topics</h3>
              <div className="flex flex-wrap gap-2">
                {repo.topics.map((topic) => (
                  <span
                    key={topic}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-[var(--color-bg-secondary)] text-[var(--color-fg-secondary)] rounded-full text-xs"
                  >
                    <Tag className="size-3" />
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-medium text-[var(--color-fg-secondary)] mb-2">Created</h3>
              <span className="text-sm text-[var(--color-fg-primary)]">{formatDate(repo.github_created_at)}</span>
            </div>
            <div>
              <h3 className="text-sm font-medium text-[var(--color-fg-secondary)] mb-2">Last Push</h3>
              <span className="text-sm text-[var(--color-fg-primary)]">{formatDate(repo.github_pushed_at)}</span>
            </div>
            <div>
              <h3 className="text-sm font-medium text-[var(--color-fg-secondary)] mb-2">Added to DB</h3>
              <span className="text-sm text-[var(--color-fg-primary)]">{formatDate(repo.created_at)}</span>
            </div>
            <div>
              <h3 className="text-sm font-medium text-[var(--color-fg-secondary)] mb-2">Metadata Synced</h3>
              <span className="text-sm text-[var(--color-fg-primary)]">{formatDate(repo.last_metadata_sync)}</span>
            </div>
          </div>

          {/* Status */}
          <div>
            <h3 className="text-sm font-medium text-[var(--color-fg-secondary)] mb-2">Status</h3>
            <div className="flex items-center gap-3">
              {getHealthBadge()}
              {repo.cloned && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-[var(--color-green-bg)] text-[var(--color-green-text)] rounded-md text-xs font-medium">
                  <CheckCircle className="size-3" />
                  Cloned
                </span>
              )}
              {repo.deployed && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-[var(--color-purple-bg)] text-[var(--color-purple-text)] rounded-md text-xs font-medium">
                  <Server className="size-3" />
                  Deployed
                </span>
              )}
              {repo.archived && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-[var(--color-yellow-bg)] text-[var(--color-yellow-text)] rounded-md text-xs font-medium">
                  <Archive className="size-3" />
                  Archived
                </span>
              )}
              {repo.is_fork && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-[var(--color-blue-bg)] text-[var(--color-blue-text)] rounded-md text-xs font-medium">
                  <GitFork className="size-3" />
                  Fork
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)]">
          <button
            onClick={handleSyncMetadata}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-[var(--color-fg-primary)] bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-lg hover:bg-[var(--color-bg-tertiary)] disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={cx('size-4', syncing && 'animate-spin')} />
            Sync Metadata
          </button>
          <div className="flex items-center gap-2">
            {!repo.cloned && (
              <button
                onClick={handleClone}
                disabled={cloning}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[var(--color-brand-600)] rounded-lg hover:bg-[var(--color-brand-700)] disabled:opacity-50 transition-colors"
              >
                <Download className="size-4" />
                Clone Repository
              </button>
            )}
            <a
              href={repo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-[var(--color-fg-primary)] bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors"
            >
              <ExternalLink className="size-4" />
              Open on GitHub
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
