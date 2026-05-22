import { useEffect, useState, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  CheckCircle,
  Server,
  ExternalLink,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Folder,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  Eye,
  Keyboard,
  GitBranch,
  Loader2,
  Heart,
  Star,
  GitFork,
  RefreshCw,
  LayoutList,
  LayoutGrid,
} from 'lucide-react'
import { useRepositoryStore } from '@/store/useRepositoryStore'
import { repositoryApi, bulkApi, generalApi, searchApi, exportApi, cloneQueueApi } from '@/api/client'
import { cx } from '@/utils/cx'
import toast from 'react-hot-toast'
import { RepositoryDetails } from './RepositoryDetails'
import { ReadmeModal } from './ReadmeModal'
import { DeleteConfirmationModal } from './DeleteConfirmationModal'
import { CategoryBadge } from './CategoryBadge'
import { useKeyboardShortcuts, KEYBOARD_SHORTCUTS } from '@/hooks/useKeyboardShortcuts'
import { useJobWebSocket } from '@/hooks/useJobWebSocket'

// Utility to clean URLs by removing tracking parameters
const cleanUrl = (url: string | undefined) => {
  if (!url) return ''
  try {
    const urlObj = new URL(url)
    // Remove common tracking parameters
    const paramsToRemove = ['fbclid', 'gclid', 'msclkid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']
    
    // Also remove parameters that start with 'aem_'
    const keysToDelete = Array.from(urlObj.searchParams.keys()).filter(
      key => paramsToRemove.includes(key) || key.startsWith('aem_')
    )
    
    keysToDelete.forEach(key => urlObj.searchParams.delete(key))
    return urlObj.toString()
  } catch {
    return url
  }
}

interface Repository {
  id: number
  name: string
  title: string
  url: string
  category: string
  cloned: boolean
  deployed: boolean
  created_at?: string
  updated_at?: string
  stars?: number
  forks?: number
  language?: string
  topics?: string[]
  description?: string
  health_status?: string
  last_health_check?: string
  zip_status?: string
}

interface CloneJob {
  id: number
  repository_id: number
  repository_name: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'
  progress: number
  error_message?: string
}

interface ImportJob {
  id: number
  source_type: string
  status: string
  total_repositories: number
  imported_repositories: number
  failed_repositories: number
  error_message?: string
  created_at: string
}

export function RepositoryList() {
  const {
    repositories,
    setRepositories,
    selectedIds,
    toggleSelection,
    selectAll,
    clearSelection,
    currentPage,
    pageSize,
    setCurrentPage,
  } = useRepositoryStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [categories, setCategories] = useState<string[]>([])
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('')

  // Filters are read from and written to the URL so views are shareable
  const filterCategory = searchParams.get('category') || null
  const filterCloned   = searchParams.get('cloned') === '1' ? true : null
  const filterDeployed = searchParams.get('deployed') === '1' ? true : null
  const searchQuery    = searchParams.get('q') || ''
  const sortBy         = searchParams.get('sort') || null
  const sortOrder      = (searchParams.get('order') as 'asc' | 'desc') || 'asc'
  const [debouncedQuery, setDebouncedQuery] = useState(searchQuery)

  const setFilterCategory = useCallback((v: string | null) =>
    setSearchParams(p => { v ? p.set('category', v) : p.delete('category'); p.delete('page'); return p }), [setSearchParams])
  const setFilterCloned = useCallback((v: boolean | null) =>
    setSearchParams(p => { v ? p.set('cloned', '1') : p.delete('cloned'); p.delete('page'); return p }), [setSearchParams])
  const setFilterDeployed = useCallback((v: boolean | null) =>
    setSearchParams(p => { v ? p.set('deployed', '1') : p.delete('deployed'); p.delete('page'); return p }), [setSearchParams])
  const setSearchQuery = useCallback((v: string) =>
    setSearchParams(p => { v ? p.set('q', v) : p.delete('q'); p.delete('page'); return p }), [setSearchParams])
  const setSortBy = useCallback((v: string | null) =>
    setSearchParams(p => { v ? p.set('sort', v) : p.delete('sort'); return p }), [setSearchParams])
  const setSortOrder = useCallback((v: 'asc' | 'desc') =>
    setSearchParams(p => { p.set('order', v); return p }), [setSearchParams])
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null)
  const [readmeRepo, setReadmeRepo] = useState<Repository | null>(null)
  const [focusedIndex, setFocusedIndex] = useState<number>(-1)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [viewMode, setViewMode] = useState<'table' | 'grid'>(
    () => (localStorage.getItem('repo-view-mode') as 'table' | 'grid') ?? 'table'
  )
  const [isCloning, setIsCloning] = useState(false)
  const [isHealthChecking, setIsHealthChecking] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState<{ done: number; total: number } | null>(null)
  const qc = useQueryClient()

  // WebSocket pushes invalidations; polling is the fallback when WS is down
  const { isConnected: wsConnected, zipProgress } = useJobWebSocket()

  // Clone jobs — WS pushes updates; fallback poll only while actively cloning
  const { data: cloneJobsData } = useQuery({
    queryKey: ['clone-jobs'],
    queryFn: async () => {
      const res = await cloneQueueApi.jobs()
      return res.data as CloneJob[]
    },
    refetchInterval: wsConnected ? false : (isCloning ? 1500 : false),
    enabled: isCloning,
  })
  const cloneJobs = cloneJobsData ?? []

  // Import jobs — WS pushes updates; fallback poll while authenticated
  const { data: importJobsData } = useQuery({
    queryKey: ['import-jobs'],
    queryFn: async () => {
      const res = await generalApi.importJobs()
      return (res.data ?? []) as ImportJob[]
    },
    enabled: !!localStorage.getItem('auth_token'),
    refetchInterval: wsConnected ? false : 2000,
    refetchIntervalInBackground: false,
  })
  const importJobs = importJobsData ?? []

  // Delete confirmation modal state
  const [deleteModal, setDeleteModal] = useState<{isOpen: boolean; title: string; message: string; itemCount: number; onConfirm: () => void}>({
    isOpen: false,
    title: '',
    message: '',
    itemCount: 0,
    onConfirm: () => {}
  })
  
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchRepositories()
    fetchCategories()
  }, [currentPage, filterCategory, filterCloned, filterDeployed, sortBy, sortOrder])

  // Stop cloning state + refresh when all clone jobs finish
  useEffect(() => {
    if (!isCloning || cloneJobs.length === 0) return
    const active = cloneJobs.filter(j => j.status === 'pending' || j.status === 'in_progress')
    if (active.length === 0) {
      const done = cloneJobs.filter(j => j.status === 'completed').length
      const failed = cloneJobs.filter(j => j.status === 'failed').length
      setIsCloning(false)
      if (done > 0) toast.success(`Cloned ${done} repositories successfully!`)
      if (failed > 0) toast.error(`${failed} repositories failed to clone`)
      fetchRepositories()
      cloneQueueApi.clear().then(() => qc.invalidateQueries({ queryKey: ['clone-jobs'] }))
    }
  }, [cloneJobs, isCloning])

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 400)
    return () => clearTimeout(t)
  }, [searchQuery])

  useEffect(() => {
    // when search changes, reset to page 1 and fetch
    setCurrentPage(1)
    fetchRepositories()
  }, [debouncedQuery])

  const fetchRepositories = async () => {
    try {
      setLoading(true)
      const skip = (currentPage - 1) * pageSize
      // If there's a search query or any filter, use the search API
      if (debouncedQuery || filterCloned !== null || filterDeployed !== null) {
        const resp = await searchApi.search(
          debouncedQuery || undefined,
          filterCategory || undefined,
          filterCloned ?? undefined,
          filterDeployed ?? undefined,
          pageSize,
          skip
        )
        const data = resp.data
        const items = data.results || []
        setRepositories(items)
        setTotalCount(data.total || 0)
      } else {
        const response = await repositoryApi.list(
          filterCategory || undefined,
          skip,
          pageSize,
          sortBy || undefined,
          sortOrder
        )
        let filtered = response.data

        // Apply category filter if selected (fallback)
        if (filterCategory) {
          filtered = filtered.filter(r => r.category === filterCategory)
        }

        setRepositories(filtered)
        // For total count, fetch all (or use a separate endpoint)
        const allResponse = await repositoryApi.list(filterCategory || undefined, 0, 10000)
        let totalFiltered = allResponse.data
        if (filterCategory) {
          totalFiltered = totalFiltered.filter(r => r.category === filterCategory)
        }
        setTotalCount(totalFiltered.length)
      }
    } catch {
      toast.error('Failed to fetch repositories')
    } finally {
      setLoading(false)
    }
  }

  const fetchCategories = async () => {
    try {
      const response = await generalApi.categories()
      const names = response.data.map((c: { category: string }) => c.category).filter(Boolean)
      setCategories([...new Set(names)])
    } catch {
      // Fallback categories
      setCategories(['security', 'ci_cd', 'database', 'devops', 'api', 'frontend', 'backend', 'ml_ai', 'other'])
    }
  }

  const handleSelectAll = () => {
    if (selectedIds.size === repositories.length) {
      clearSelection()
    } else {
      selectAll(repositories)
    }
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return

    setDeleteModal({
      isOpen: true,
      title: 'Delete Repositories',
      message: `Are you sure you want to delete ${selectedIds.size} selected repositories? This action cannot be undone.`,
      itemCount: selectedIds.size,
      onConfirm: async () => {
        try {
          await bulkApi.delete(Array.from(selectedIds))
          toast.success(`Deleted ${selectedIds.size} repositories`)
          clearSelection()
          fetchRepositories()
          setDeleteModal(prev => ({...prev, isOpen: false}))
        } catch {
          toast.error('Failed to delete repositories')
        }
      }
    })
  }

  const handleBulkUpdateCategory = async () => {
    if (selectedIds.size === 0 || !selectedCategory) return

    try {
      await bulkApi.updateCategory(Array.from(selectedIds), selectedCategory)
      toast.success(`Updated ${selectedIds.size} repositories`)
      clearSelection()
      setShowCategoryModal(false)
      setSelectedCategory('')
      fetchRepositories()
    } catch {
      toast.error('Failed to update category')
    }
  }

  const handleDeleteClone = async (e: React.MouseEvent, repoId: number, repoName: string) => {
    e.stopPropagation()
    if (!window.confirm(`Delete local clone of "${repoName}"? The repo stays in your library.`)) return
    try {
      await repositoryApi.deleteClone(repoId)
      toast.success(`Clone of ${repoName} deleted`)
      qc.invalidateQueries({ queryKey: ['repositories'] })
    } catch {
      toast.error('Failed to delete clone')
    }
  }

  const handleEnqueueZip = async (e: React.MouseEvent, repoId: number) => {
    e.stopPropagation()
    try {
      await repositoryApi.enqueueZip(repoId)
      toast.success('ZIP archive queued')
      qc.invalidateQueries({ queryKey: ['repositories'] })
    } catch {
      toast.error('Failed to queue ZIP')
    }
  }

  const handleDownloadZip = async (e: React.MouseEvent, repoId: number, repoName: string) => {
    e.stopPropagation()
    try {
      const res = await fetch(`/api/repositories/${repoId}/zip/download`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'ZIP not available' }))
        toast.error(err.detail || 'ZIP not available')
        qc.invalidateQueries({ queryKey: ['repositories'] })
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${repoName.split('/').pop()}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Failed to download ZIP')
    }
  }

  const handleBulkDeleteClones = async () => {
    const ids = repositories.filter(r => selectedIds.has(r.id) && r.cloned).map(r => r.id)
    if (ids.length === 0) { toast.error('No cloned repos selected'); return }
    if (!window.confirm(`Delete local clones for ${ids.length} repositories?`)) return
    try {
      const res = await bulkApi.deleteClones(ids)
      toast.success(`Deleted ${res.data.deleted} clones`)
      qc.invalidateQueries({ queryKey: ['repositories'] })
      clearSelection()
    } catch { toast.error('Failed to delete clones') }
  }

  const handleBulkGetZips = async () => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    try {
      const res = await bulkApi.enqueueZips(ids)
      toast.success(`Queued ${res.data.enqueued} ZIP jobs`)
      qc.invalidateQueries({ queryKey: ['repositories'] })
    } catch { toast.error('Failed to queue ZIPs') }
  }

  const handleBulkDownloadZips = async () => {
    const ready = repositories.filter(r => selectedIds.has(r.id) && r.zip_status === 'done')
    if (ready.length === 0) { toast.error('No selected repos have a ready ZIP'); return }
    toast.success(`Downloading ${ready.length} ZIP files…`)
    for (const repo of ready) {
      const res = await fetch(`/api/repositories/${repo.id}/zip/download`)
      if (!res.ok) continue
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${repo.name.split('/').pop()}.zip`
      a.click()
      URL.revokeObjectURL(url)
      await new Promise(r => setTimeout(r, 400))  // brief pause between downloads
    }
  }

  const handleBulkDeleteZips = async () => {
    const ids = repositories.filter(r => selectedIds.has(r.id) && r.zip_status).map(r => r.id)
    if (ids.length === 0) { toast.error('No selected repos have a ZIP'); return }
    if (!window.confirm(`Delete ZIP files for ${ids.length} repositories?`)) return
    try {
      const res = await bulkApi.deleteZips(ids)
      toast.success(`Deleted ${res.data.deleted} ZIP files`)
      qc.invalidateQueries({ queryKey: ['repositories'] })
      clearSelection()
    } catch { toast.error('Failed to delete ZIPs') }
  }

  const handleBulkClone = async () => {
    if (selectedIds.size === 0) return

    // Filter to only non-cloned repos
    const reposToClone = repositories.filter(
      (repo) => selectedIds.has(repo.id) && !repo.cloned
    )

    if (reposToClone.length === 0) {
      toast.error('All selected repositories are already cloned')
      return
    }

    try {
      await cloneQueueApi.clear()
      qc.invalidateQueries({ queryKey: ['clone-jobs'] })
      const response = await cloneQueueApi.add(reposToClone.map((r) => r.id))
      toast.success(`Started cloning ${response.data.jobs_added} repositories`)
      setIsCloning(true)
      clearSelection()
    } catch {
      toast.error('Failed to start cloning')
    }
  }

  const handleBulkHealthCheck = async () => {
    if (selectedIds.size === 0) return

    try {
      setIsHealthChecking(true)
      const response = await bulkApi.healthCheck(Array.from(selectedIds))
      toast.success(
        `Health check completed: ${response.data.healthy} healthy, ${response.data.archived} archived, ${response.data.not_found} not found`
      )
      clearSelection()
      fetchRepositories()
    } catch {
      toast.error('Failed to check health')
    } finally {
      setIsHealthChecking(false)
    }
  }


  const handleBulkSyncMetadata = async () => {
    if (selectedIds.size === 0) return

    const ids = Array.from(selectedIds)
    const total = ids.length
    setIsSyncing(true)
    setSyncProgress({ done: 0, total })

    // 3 concurrent workers — stealth fetches to github.com, keep it polite
    let nextIdx = 0, done = 0, succeeded = 0, failed = 0

    async function worker() {
      while (true) {
        const i = nextIdx++
        if (i >= total) break
        try {
          await repositoryApi.syncMetadata(ids[i])
          succeeded++
        } catch {
          failed++
        }
        done++
        setSyncProgress({ done, total })
      }
    }

    await Promise.all(Array.from({ length: Math.min(3, total) }, worker))

    setIsSyncing(false)
    setSyncProgress(null)

    if (failed === 0) {
      toast.success(`Metadata synced for ${succeeded} repositories`)
    } else {
      toast.error(`Synced ${succeeded}, failed ${failed}`)
    }

    fetchRepositories()
  }

  const handleDeleteAll = async () => {
    if (totalCount === 0) return

    setDeleteModal({
      isOpen: true,
      title: 'Delete All Repositories',
      message: `This will permanently delete ALL ${totalCount} repositories from the system. This action cannot be undone and all local clones will be removed.`,
      itemCount: totalCount,
      onConfirm: async () => {
        try {
          setLoading(true)
          // Fetch all matching IDs according to current filters/search
          let allIds: number[] = []
          if (debouncedQuery || filterCloned !== null || filterDeployed !== null) {
            // use search API to get all (up to 10000)
            const resp = await searchApi.search(
              debouncedQuery || undefined,
              filterCategory || undefined,
              filterCloned ?? undefined,
              filterDeployed ?? undefined,
              10000,
              0
            )
            const data = resp.data
            allIds = (data.results || []).map((r: any) => r.id)
          } else {
            const resp = await repositoryApi.list(filterCategory || undefined, 0, 10000)
            allIds = (resp.data || []).map((r: any) => r.id)
          }
          if (allIds.length === 0) {
            toast('No repositories to delete')
            setLoading(false)
            return
          }
          await bulkApi.delete(allIds)
          toast.success(`Deleted all ${totalCount} repositories`)
          clearSelection()
          setFilterCategory(null)
          setFilterCloned(null)
          setFilterDeployed(null)
          setSearchQuery('')
          fetchRepositories()
          setDeleteModal(prev => ({...prev, isOpen: false}))
        } catch {
          toast.error('Failed to delete all repositories')
        } finally {
          setLoading(false)
        }
      }
    })
  }

  const totalPages = Math.ceil(totalCount / pageSize)

  const handleSort = (column: string) => {
    if (sortBy === column) {
      // Toggle order if same column
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      // New column, default to ascending
      setSortBy(column)
      setSortOrder('asc')
    }
    setCurrentPage(1)
  }

  const getSortIcon = (column: string) => {
    if (sortBy !== column) {
      return <ArrowUpDown className="size-3 opacity-50" />
    }
    return sortOrder === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
  }

  const handleExport = (format: 'csv' | 'json' | 'markdown') => {
    const url = format === 'csv'
      ? exportApi.csv(filterCategory || undefined)
      : format === 'json'
      ? exportApi.json(filterCategory || undefined)
      : exportApi.markdown(filterCategory || undefined)

    window.open(url, '_blank')
    setShowExportMenu(false)
    toast.success(`Exporting as ${format.toUpperCase()}...`)
  }

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onSearch: () => searchInputRef.current?.focus(),
    onNextItem: () => {
      if (repositories.length > 0) {
        setFocusedIndex((prev) => Math.min(prev + 1, repositories.length - 1))
      }
    },
    onPrevItem: () => {
      if (repositories.length > 0) {
        setFocusedIndex((prev) => Math.max(prev - 1, 0))
      }
    },
    onSelectItem: () => {
      if (focusedIndex >= 0 && focusedIndex < repositories.length) {
        toggleSelection(repositories[focusedIndex].id)
      }
    },
    onOpenDetails: () => {
      if (focusedIndex >= 0 && focusedIndex < repositories.length) {
        setSelectedRepo(repositories[focusedIndex])
      }
    },
    onDelete: () => {
      if (selectedIds.size > 0) {
        handleBulkDelete()
      }
    },
    onClearSelection: () => {
      clearSelection()
      setFocusedIndex(-1)
    },
    onSelectAll: () => {
      if (selectedIds.size === repositories.length) {
        clearSelection()
      } else {
        selectAll(repositories)
      }
    },
    onExport: () => setShowExportMenu(true),
    onRefresh: () => fetchRepositories(),
    onEscape: () => {
      if (selectedRepo) {
        setSelectedRepo(null)
      } else if (selectedIds.size > 0) {
        clearSelection()
      } else {
        setFocusedIndex(-1)
      }
    },
  }, !selectedRepo) // Disable shortcuts when details panel is open

  if (loading && repositories.length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--color-brand-500)] border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-[length:var(--text-display-xs)] font-semibold text-[var(--color-fg-primary)]">
          Repositories
        </h2>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowShortcuts(!showShortcuts)}
            className="flex items-center gap-1 px-2 py-1 text-xs text-[var(--color-fg-tertiary)] hover:text-[var(--color-fg-secondary)] transition-colors"
            title="Keyboard shortcuts"
          >
            <Keyboard className="size-4" />
            Shortcuts
          </button>
          <div className="flex items-center border border-[var(--color-border-primary)] rounded-[var(--radius-md)] overflow-hidden">
            <button
              onClick={() => { setViewMode('table'); localStorage.setItem('repo-view-mode', 'table') }}
              className={cx(
                'p-1.5 transition-colors',
                viewMode === 'table'
                  ? 'bg-[var(--color-brand-50)] text-[var(--color-brand-600)]'
                  : 'text-[var(--color-fg-tertiary)] hover:text-[var(--color-fg-secondary)] hover:bg-[var(--color-bg-secondary)]'
              )}
              title="Table view"
            >
              <LayoutList className="size-4" />
            </button>
            <button
              onClick={() => { setViewMode('grid'); localStorage.setItem('repo-view-mode', 'grid') }}
              className={cx(
                'p-1.5 transition-colors',
                viewMode === 'grid'
                  ? 'bg-[var(--color-brand-50)] text-[var(--color-brand-600)]'
                  : 'text-[var(--color-fg-tertiary)] hover:text-[var(--color-fg-secondary)] hover:bg-[var(--color-bg-secondary)]'
              )}
              title="Grid view"
            >
              <LayoutGrid className="size-4" />
            </button>
          </div>
          <span className="text-[length:var(--text-sm)] text-[var(--color-fg-tertiary)]">
            {totalCount} total
          </span>
        </div>
      </div>

      {/* Keyboard Shortcuts Help */}
      {showShortcuts && (
        <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border-secondary)] rounded-lg p-4">
          <h3 className="text-sm font-medium text-[var(--color-fg-primary)] mb-2">Keyboard Shortcuts</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {KEYBOARD_SHORTCUTS.map(({ key, description }) => (
              <div key={key} className="flex items-center gap-2 text-xs">
                <kbd className="px-1.5 py-0.5 bg-[var(--color-bg-tertiary)] border border-[var(--color-border-primary)] rounded text-[var(--color-fg-secondary)] font-mono">
                  {key}
                </kbd>
                <span className="text-[var(--color-fg-tertiary)]">{description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter and Actions Row */}
      <div className="flex items-center gap-3 justify-between flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={filterCategory || ''}
            onChange={(e) => {
              setFilterCategory(e.target.value || null)
              setCurrentPage(1)
            }}
            className="px-3 py-2 text-[length:var(--text-sm)] border border-[var(--color-border-primary)] rounded-[var(--radius-md)] bg-[var(--color-bg-primary)] text-[var(--color-fg-primary)] hover:border-[var(--color-brand-300)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-500)]"
          >
            <option value="" className="text-[var(--color-fg-primary)] dark:text-gray-100">All Categories</option>
            {categories.filter(Boolean).map((cat) => (
              <option key={cat} value={cat} className="text-[var(--color-fg-primary)] dark:text-gray-100">
                {cat}
              </option>
            ))}
          </select>
          <input
            ref={searchInputRef}
            placeholder="Search repositories... (press /)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-3 py-2 text-[length:var(--text-sm)] border border-[var(--color-border-primary)] rounded-[var(--radius-md)] bg-[var(--color-bg-primary)] text-[var(--color-fg-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-500)] min-w-[200px]"
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={filterCloned === true}
              onChange={(e) => {
                setFilterCloned(e.target.checked ? true : null)
                setCurrentPage(1)
              }}
              className="w-4 h-4 rounded border-[var(--color-border-primary)] text-[var(--color-brand-600)] focus:ring-[var(--color-brand-500)]"
            />
            <span className="text-[length:var(--text-sm)] text-[var(--color-fg-secondary)]">Cloned</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={filterDeployed === true}
              onChange={(e) => {
                setFilterDeployed(e.target.checked ? true : null)
                setCurrentPage(1)
              }}
              className="w-4 h-4 rounded border-[var(--color-border-primary)] text-[var(--color-brand-600)] focus:ring-[var(--color-brand-500)]"
            />
            <span className="text-[length:var(--text-sm)] text-[var(--color-fg-secondary)]">Deployed</span>
          </label>
          {(filterCategory || filterCloned !== null || filterDeployed !== null || searchQuery) && (
            <button
              onClick={() => {
                setFilterCategory(null)
                setFilterCloned(null)
                setFilterDeployed(null)
                setSearchQuery('')
                setCurrentPage(1)
              }}
              className="px-3 py-2 text-[length:var(--text-sm)] font-medium text-[var(--color-brand-600)] hover:text-[var(--color-brand-700)] underline"
            >
              Clear filters
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Export Dropdown */}
          {totalCount > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="px-4 py-2 text-[length:var(--text-sm)] font-medium text-[var(--color-fg-primary)] bg-[var(--color-bg-primary)] hover:bg-[var(--color-bg-tertiary)] border border-[var(--color-border-primary)] rounded-[var(--radius-md)] transition-colors flex items-center gap-2"
              >
                <Download className="size-4" />
                Export
              </button>
              {showExportMenu && (
                <div className="absolute right-0 mt-1 w-40 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-md)] shadow-lg z-10">
                  <button
                    onClick={() => handleExport('csv')}
                    className="w-full px-4 py-2 text-left text-[length:var(--text-sm)] hover:bg-[var(--color-bg-tertiary)]"
                  >
                    Export as CSV
                  </button>
                  <button
                    onClick={() => handleExport('json')}
                    className="w-full px-4 py-2 text-left text-[length:var(--text-sm)] hover:bg-[var(--color-bg-tertiary)]"
                  >
                    Export as JSON
                  </button>
                  <button
                    onClick={() => handleExport('markdown')}
                    className="w-full px-4 py-2 text-left text-[length:var(--text-sm)] hover:bg-[var(--color-bg-tertiary)]"
                  >
                    Export as Markdown
                  </button>
                </div>
              )}
            </div>
          )}
          {totalCount > 0 && (
            <button
              onClick={handleDeleteAll}
              disabled={loading}
              className="px-4 py-2 text-[length:var(--text-sm)] font-medium text-white bg-[var(--color-error-600)] hover:bg-[var(--color-error-700)] disabled:opacity-50 border border-[var(--color-error-700)] rounded-[var(--radius-md)] transition-colors flex items-center gap-2"
            >
              <Trash2 className="size-4" />
              Delete All
            </button>
          )}
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="bg-[var(--color-brand-50)] border border-[var(--color-brand-200)] rounded-[var(--radius-lg)] p-3 flex items-center justify-between">
          <span className="text-[length:var(--text-sm)] font-medium text-[var(--color-brand-700)]">
            {selectedIds.size} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCategoryModal(true)}
              className="px-3 py-1.5 text-[length:var(--text-sm)] font-medium text-[var(--color-brand-700)] dark:text-[var(--color-brand-400)] bg-[var(--color-brand-50)] dark:bg-[var(--color-brand-900)] border border-[var(--color-brand-300)] dark:border-[var(--color-brand-700)] rounded-[var(--radius-md)] hover:bg-[var(--color-brand-100)] dark:hover:bg-[var(--color-brand-800)] transition-colors"
            >
              <Folder className="size-4 inline mr-1" />
              Change Category
            </button>
            <button
              onClick={handleBulkClone}
              disabled={isCloning}
              className="px-3 py-1.5 text-[length:var(--text-sm)] font-medium text-[var(--color-success-700)] dark:text-[var(--color-success-400)] bg-[var(--color-success-50)] dark:bg-[var(--color-success-900)] border border-[var(--color-success-300)] dark:border-[var(--color-success-700)] rounded-[var(--radius-md)] hover:bg-[var(--color-success-100)] dark:hover:bg-[var(--color-success-800)] transition-colors disabled:opacity-50"
            >
              {isCloning ? (
                <Loader2 className="size-4 inline mr-1 animate-spin" />
              ) : (
                <GitBranch className="size-4 inline mr-1" />
              )}
              Clone
            </button>
            <button
              onClick={handleBulkHealthCheck}
              disabled={isHealthChecking}
              className="px-3 py-1.5 text-[length:var(--text-sm)] font-medium text-[var(--color-info-700)] dark:text-[var(--color-info-400)] bg-[var(--color-info-50)] dark:bg-[var(--color-info-900)] border border-[var(--color-info-300)] dark:border-[var(--color-info-700)] rounded-[var(--radius-md)] hover:bg-[var(--color-info-100)] dark:hover:bg-[var(--color-info-800)] transition-colors disabled:opacity-50"
            >
              {isHealthChecking ? (
                <Loader2 className="size-4 inline mr-1 animate-spin" />
              ) : (
                <Heart className="size-4 inline mr-1" />
              )}
              Health Check
            </button>
            <button
              onClick={handleBulkSyncMetadata}
              disabled={isSyncing}
              className="px-3 py-1.5 text-[length:var(--text-sm)] font-medium text-[var(--color-warning-700)] dark:text-[var(--color-warning-400)] bg-[var(--color-warning-50)] dark:bg-[var(--color-warning-900)] border border-[var(--color-warning-300)] dark:border-[var(--color-warning-700)] rounded-[var(--radius-md)] hover:bg-[var(--color-warning-100)] dark:hover:bg-[var(--color-warning-800)] transition-colors disabled:opacity-50"
            >
              {isSyncing ? (
                <Loader2 className="size-4 inline mr-1 animate-spin" />
              ) : (
                <RefreshCw className="size-4 inline mr-1" />
              )}
              {isSyncing && syncProgress
                ? `Syncing ${syncProgress.done}/${syncProgress.total}`
                : 'Sync Metadata'}
            </button>
            <button
              onClick={handleBulkDeleteClones}
              className="px-3 py-1.5 text-[length:var(--text-sm)] font-medium text-[var(--color-warning-700)] bg-[var(--color-warning-50)] border border-[var(--color-warning-200)] rounded-[var(--radius-md)] hover:bg-[var(--color-warning-100)] transition-colors"
            >
              <GitBranch className="size-4 inline mr-1" />
              Delete clone
            </button>
            <button
              onClick={handleBulkGetZips}
              className="px-3 py-1.5 text-[length:var(--text-sm)] font-medium text-blue-700 bg-blue-50 border border-blue-300 rounded-[var(--radius-md)] hover:bg-blue-100 transition-colors"
            >
              <Download className="size-4 inline mr-1" />
              Get ZIP
            </button>
            <button
              onClick={handleBulkDownloadZips}
              className="px-3 py-1.5 text-[length:var(--text-sm)] font-medium text-blue-700 bg-blue-50 border border-blue-300 rounded-[var(--radius-md)] hover:bg-blue-100 transition-colors"
            >
              <Download className="size-4 inline mr-1" />
              Download ZIP
            </button>
            <button
              onClick={handleBulkDeleteZips}
              className="px-3 py-1.5 text-[length:var(--text-sm)] font-medium text-[var(--color-warning-700)] bg-[var(--color-warning-50)] border border-[var(--color-warning-200)] rounded-[var(--radius-md)] hover:bg-[var(--color-warning-100)] transition-colors"
            >
              <Trash2 className="size-4 inline mr-1" />
              Delete ZIP
            </button>
            <button
              onClick={handleBulkDelete}
              className="px-3 py-1.5 text-[length:var(--text-sm)] font-medium text-[var(--color-error-700)] dark:text-[var(--color-error-400)] bg-[var(--color-error-50)] dark:bg-[var(--color-error-900)] border border-[var(--color-error-300)] dark:border-[var(--color-error-700)] rounded-[var(--radius-md)] hover:bg-[var(--color-error-100)] dark:hover:bg-[var(--color-error-800)] transition-colors"
            >
              <Trash2 className="size-4 inline mr-1" />
              Delete
            </button>
            <button
              onClick={clearSelection}
              className="px-3 py-1.5 text-[length:var(--text-sm)] font-medium text-[var(--color-fg-tertiary)] hover:text-[var(--color-fg-primary)] transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Clone Progress Indicator */}
      {isCloning && cloneJobs.length > 0 && (
        <div className="bg-[var(--color-success-50)] border border-[var(--color-success-200)] rounded-[var(--radius-lg)] p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Loader2 className="size-5 text-[var(--color-success-600)] animate-spin" />
              <span className="text-[length:var(--text-sm)] font-medium text-[var(--color-success-800)]">
                Cloning repositories...
              </span>
            </div>
            <span className="text-[length:var(--text-sm)] text-[var(--color-success-700)]">
              {cloneJobs.filter((j) => j.status === 'completed').length} / {cloneJobs.length} completed
            </span>
          </div>
          <div className="w-full bg-[var(--color-success-100)] rounded-full h-2">
            <div
              className="bg-[var(--color-success-500)] h-2 rounded-full transition-all duration-300"
              style={{
                width: `${(cloneJobs.filter((j) => j.status === 'completed').length / cloneJobs.length) * 100}%`,
              }}
            />
          </div>
          <div className="mt-2 space-y-1">
            {cloneJobs
              .filter((j) => j.status === 'in_progress')
              .map((job) => (
                <div key={job.id} className="flex items-center gap-2 text-[length:var(--text-xs)] text-[var(--color-success-700)]">
                  <Loader2 className="size-3 animate-spin" />
                  <span>Cloning {job.repository_name}...</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {repositories.length === 0 && !loading ? (
        <div className="bg-[var(--color-bg-primary)] rounded-[var(--radius-xl)] border border-[var(--color-border-secondary)] p-16 text-center flex flex-col items-center gap-4">
          {filterCategory || filterCloned !== null || filterDeployed !== null || searchQuery ? (
            <>
              <p className="text-[length:var(--text-lg)] font-medium text-[var(--color-fg-primary)]">No results</p>
              <p className="text-[length:var(--text-sm)] text-[var(--color-fg-tertiary)]">
                No repositories match the current filters.
              </p>
              <button
                onClick={() => { setFilterCategory(null); setFilterCloned(null); setFilterDeployed(null); setSearchQuery('') }}
                className="px-4 py-2 text-[length:var(--text-sm)] font-medium text-[var(--color-brand-600)] hover:text-[var(--color-brand-700)] underline"
              >
                Clear filters
              </button>
            </>
          ) : (
            <>
              <GitBranch className="size-12 text-[var(--color-fg-quaternary)]" />
              <p className="text-[length:var(--text-lg)] font-medium text-[var(--color-fg-primary)]">No repositories yet</p>
              <p className="text-[length:var(--text-sm)] text-[var(--color-fg-tertiary)] max-w-sm">
                Import your first repositories from GitHub, browser bookmarks, or paste a URL to get started.
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          {viewMode === 'table' ? (
            /* Table */
            <div className="bg-[var(--color-bg-primary)] rounded-[var(--radius-xl)] shadow-[var(--shadow-sm)] border border-[var(--color-border-secondary)] overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)]">
                    <th className="w-12 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === repositories.length && repositories.length > 0}
                        onChange={handleSelectAll}
                        className="w-4 h-4 rounded border-[var(--color-border-primary)] text-[var(--color-brand-600)] focus:ring-[var(--color-brand-500)]"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-[length:var(--text-xs)] font-semibold text-[var(--color-fg-tertiary)] uppercase tracking-wider cursor-pointer hover:text-[var(--color-fg-primary)] select-none min-w-[200px] max-w-[320px]"
                      onClick={() => handleSort('name')}
                    >
                      <span className="flex items-center gap-1">
                        Repository
                        {getSortIcon('name')}
                      </span>
                    </th>
                    <th className="px-4 py-3 text-left text-[length:var(--text-xs)] font-semibold text-[var(--color-fg-tertiary)] uppercase tracking-wider min-w-[180px]">
                      State
                    </th>
                    <th className="px-4 py-3 text-left text-[length:var(--text-xs)] font-semibold text-[var(--color-fg-tertiary)] uppercase tracking-wider cursor-pointer hover:text-[var(--color-fg-primary)] select-none min-w-[100px]"
                      onClick={() => handleSort('category')}
                    >
                      <span className="flex items-center gap-1">
                        Category
                        {getSortIcon('category')}
                      </span>
                    </th>
                    <th className="px-4 py-3 text-left text-[length:var(--text-xs)] font-semibold text-[var(--color-fg-tertiary)] uppercase tracking-wider min-w-[150px]">
                      Metadata
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-secondary)]">
                  {repositories?.filter(repo => repo != null).map((repo: Repository, index: number) => (
                    <tr
                      key={repo.id}
                      className={cx(
                        'hover:bg-[var(--color-bg-secondary)] transition-colors cursor-pointer',
                        selectedIds.has(repo?.id) && 'bg-[var(--color-brand-25)]',
                        focusedIndex === index && 'ring-2 ring-inset ring-[var(--color-brand-400)]'
                      )}
                      onClick={() => setFocusedIndex(index)}
                      onDoubleClick={() => setSelectedRepo(repo)}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={repo?.id ? selectedIds.has(repo.id) : false}
                          onChange={(e) => {
                            e.stopPropagation()
                            repo?.id && toggleSelection(repo.id)
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 rounded border-[var(--color-border-primary)] text-[var(--color-brand-600)] focus:ring-[var(--color-brand-500)]"
                        />
                      </td>
                      <td className="px-4 py-3 min-w-[200px] max-w-[320px]">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <button
                              className="text-[length:var(--text-sm)] font-medium text-[var(--color-brand-600)] hover:underline text-left"
                              onClick={(e) => { e.stopPropagation(); setReadmeRepo(repo) }}
                              title="View README"
                            >
                              {repo?.name || 'Unknown'}
                            </button>
                            {repo?.title && (
                              <p className="text-[length:var(--text-xs)] text-[var(--color-fg-tertiary)] truncate">
                                {repo.title}
                              </p>
                            )}
                            <a
                              href={repo?.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[length:var(--text-xs)] text-[var(--color-brand-600)] hover:text-[var(--color-brand-700)] truncate mt-1"
                              title={repo?.url || 'No URL'}
                            >
                              <ExternalLink className="size-3 flex-shrink-0" />
                              <span className="truncate">{cleanUrl(repo?.url) || 'No URL'}</span>
                            </a>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedRepo(repo)
                            }}
                            className="px-2 py-1 rounded-[var(--radius-md)] text-[length:var(--text-xs)] font-medium text-[var(--color-brand-600)] bg-[var(--color-brand-50)] hover:bg-[var(--color-brand-100)] border border-[var(--color-brand-200)] transition-colors flex items-center gap-1 flex-shrink-0"
                            title="View details"
                          >
                            <Eye className="size-3" />
                            View
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 min-w-[180px]">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            {repo?.cloned ? (
                              <>
                                <span className="inline-flex items-center gap-1 px-2 py-1 text-[length:var(--text-xs)] font-medium bg-[var(--color-success-50)] text-[var(--color-success-700)] rounded-[var(--radius-md)]">
                                  <CheckCircle className="size-3" />
                                  Cloned
                                </span>
                                <button
                                  onClick={(e) => handleDeleteClone(e, repo.id, repo.name)}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-[length:var(--text-xs)] font-medium bg-red-50 text-red-600 hover:bg-red-100 rounded-[var(--radius-md)] transition-colors"
                                  title="Delete local clone"
                                >
                                  <Trash2 className="size-3" />
                                  Delete clone
                                </button>
                              </>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-1 text-[length:var(--text-xs)] font-medium bg-gray-100 text-gray-600 rounded-[var(--radius-md)]">
                                Not cloned
                              </span>
                            )}
                          </div>
                          {repo?.health_status && (
                            <span className={`inline-flex items-center gap-1 px-2 py-1 text-[length:var(--text-xs)] font-medium rounded-[var(--radius-md)] w-fit ${
                              repo.health_status === 'healthy' ? 'bg-[var(--color-success-50)] text-[var(--color-success-700)]' :
                              repo.health_status === 'archived' ? 'bg-[var(--color-bg-tertiary)] text-[var(--color-fg-tertiary)]' :
                              repo.health_status === 'not_found' ? 'bg-red-100 text-red-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>
                              <Heart className="size-3" />
                              {repo.health_status}
                            </span>
                          )}
                          {repo?.deployed && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 text-[length:var(--text-xs)] font-medium bg-[var(--color-purple-50)] text-[var(--color-purple-700)] rounded-[var(--radius-md)] w-fit">
                              <Server className="size-3" />
                              Deployed
                            </span>
                          )}
                          {repo?.zip_status === 'done' ? (
                            <button
                              onClick={(e) => handleDownloadZip(e, repo.id, repo.name)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[length:var(--text-xs)] font-medium rounded-[var(--radius-md)] w-fit bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                              title="Download ZIP archive"
                            >
                              <Download className="size-3" />
                              Download ZIP
                            </button>
                          ) : repo?.zip_status === 'in_progress' || repo?.zip_status === 'pending' ? (
                            <div className="flex flex-col gap-1 w-full max-w-[160px]">
                              <span className="inline-flex items-center gap-1 text-[length:var(--text-xs)] font-medium text-yellow-700">
                                <Loader2 className="size-3 animate-spin" />
                                {zipProgress[repo.id]
                                  ? `Zipping… ${zipProgress[repo.id].pct}%`
                                  : 'Zipping…'}
                              </span>
                              <div className="w-full h-1.5 bg-[var(--color-warning-100)] rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-[var(--color-warning-400)] rounded-full transition-all duration-300"
                                  style={{ width: `${zipProgress[repo.id]?.pct ?? 0}%` }}
                                />
                              </div>
                              {zipProgress[repo.id]?.total > 0 && (
                                <span className="text-[10px] text-[var(--color-fg-quaternary)]">
                                  {(zipProgress[repo.id].downloaded / 1024 / 1024).toFixed(1)} /
                                  {(zipProgress[repo.id].total / 1024 / 1024).toFixed(1)} MB
                                </span>
                              )}
                            </div>
                          ) : repo?.zip_status === 'failed' ? (
                            <button
                              onClick={(e) => handleEnqueueZip(e, repo.id)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[length:var(--text-xs)] font-medium rounded-[var(--radius-md)] w-fit bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
                              title="ZIP failed — click to retry"
                            >
                              <Download className="size-3" />
                              ZIP failed — retry
                            </button>
                          ) : (
                            <button
                              onClick={(e) => handleEnqueueZip(e, repo.id)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[length:var(--text-xs)] font-medium rounded-[var(--radius-md)] w-fit bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                              title="Create ZIP archive"
                            >
                              <Download className="size-3" />
                              Get ZIP
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 min-w-[100px]">
                        <CategoryBadge category={repo?.category || 'uncategorized'} />
                      </td>
                      <td className="px-4 py-3 min-w-[150px]">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 text-[length:var(--text-xs)] text-[var(--color-fg-secondary)]">
                            {(repo?.stars ?? 0) > 0 && (
                              <span className="inline-flex items-center gap-1">
                                <Star className="size-3 text-[var(--color-warning-400)]" />
                                {repo.stars!.toLocaleString()}
                              </span>
                            )}
                            {(repo?.forks ?? 0) > 0 && (
                              <span className="inline-flex items-center gap-1">
                                <GitFork className="size-3 text-[var(--color-fg-tertiary)]" />
                                {repo.forks!.toLocaleString()}
                              </span>
                            )}
                            {repo?.language && (
                              <span className="px-2 py-0.5 bg-[var(--color-bg-secondary)] rounded-[var(--radius-sm)] font-medium">
                                {repo.language}
                              </span>
                            )}
                            {!repo?.language && !repo?.stars && !repo?.forks && (
                              <span className="text-[var(--color-fg-quaternary)]">—</span>
                            )}
                          </div>
                          {(repo?.topics?.length ?? 0) > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {repo.topics!.slice(0, 3).map(t => (
                                <span key={t} className="px-1.5 py-0.5 text-[10px] bg-[var(--color-brand-50)] text-[var(--color-brand-600)] rounded-[var(--radius-sm)]">
                                  {t}
                                </span>
                              ))}
                              {repo.topics!.length > 3 && (
                                <span className="text-[10px] text-[var(--color-fg-quaternary)]">+{repo.topics!.length - 3}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            /* Grid */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {repositories?.filter(repo => repo != null).map((repo: Repository, index: number) => (
                <div
                  key={repo.id}
                  className={cx(
                    'bg-[var(--color-bg-primary)] rounded-[var(--radius-xl)] border border-[var(--color-border-secondary)] shadow-[var(--shadow-sm)] flex flex-col cursor-pointer transition-all hover:shadow-[var(--shadow-md)] hover:border-[var(--color-border-primary)]',
                    selectedIds.has(repo?.id) && 'border-[var(--color-brand-300)] bg-[var(--color-brand-25)]',
                    focusedIndex === index && 'ring-2 ring-[var(--color-brand-400)]'
                  )}
                  onClick={() => setFocusedIndex(index)}
                  onDoubleClick={() => setSelectedRepo(repo)}
                >
                  {/* ── Header: checkbox · name · external link ── */}
                  <div className="flex items-start gap-2 p-4 pb-0">
                    <input
                      type="checkbox"
                      checked={repo?.id ? selectedIds.has(repo.id) : false}
                      onChange={(e) => { e.stopPropagation(); repo?.id && toggleSelection(repo.id) }}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1 w-4 h-4 rounded border-[var(--color-border-primary)] text-[var(--color-brand-600)] focus:ring-[var(--color-brand-500)] flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <button
                        className="text-[length:var(--text-sm)] font-semibold text-[var(--color-brand-600)] hover:underline text-left leading-snug line-clamp-2 w-full"
                        onClick={(e) => { e.stopPropagation(); setReadmeRepo(repo) }}
                        title="View README"
                      >
                        {repo?.name || 'Unknown'}
                      </button>
                    </div>
                    <a
                      href={repo?.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="mt-0.5 text-[var(--color-fg-quaternary)] hover:text-[var(--color-brand-500)] transition-colors flex-shrink-0"
                      title="Open in browser"
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  </div>

                  {/* ── Description ── */}
                  <p className="px-4 pt-2 text-[length:var(--text-xs)] text-[var(--color-fg-tertiary)] line-clamp-2 leading-relaxed min-h-[2.5rem]">
                    {repo?.description || repo?.title || <span className="italic opacity-50">No description</span>}
                  </p>

                  {/* ── Stats: language · stars · forks ── */}
                  <div className="flex items-center gap-3 px-4 pt-3 text-[length:var(--text-xs)] text-[var(--color-fg-secondary)]">
                    {repo?.language ? (
                      <span className="inline-flex items-center gap-1 font-medium">
                        <span className="w-2 h-2 rounded-full bg-[var(--color-brand-400)] flex-shrink-0" />
                        {repo.language}
                      </span>
                    ) : null}
                    {(repo?.stars ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Star className="size-3 text-[var(--color-warning-400)]" />
                        {repo.stars!.toLocaleString()}
                      </span>
                    )}
                    {(repo?.forks ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <GitFork className="size-3 text-[var(--color-fg-tertiary)]" />
                        {repo.forks!.toLocaleString()}
                      </span>
                    )}
                    {!repo?.language && !(repo?.stars ?? 0) && !(repo?.forks ?? 0) && (
                      <span className="text-[var(--color-fg-quaternary)]">No metadata</span>
                    )}
                  </div>

                  {/* ── Topics ── */}
                  {(repo?.topics?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1 px-4 pt-2">
                      {repo.topics!.slice(0, 4).map(t => (
                        <span key={t} className="px-1.5 py-0.5 text-[10px] bg-[var(--color-brand-50)] text-[var(--color-brand-600)] rounded-[var(--radius-sm)]">
                          {t}
                        </span>
                      ))}
                      {repo.topics!.length > 4 && (
                        <span className="text-[10px] text-[var(--color-fg-quaternary)] self-center">+{repo.topics!.length - 4}</span>
                      )}
                    </div>
                  )}

                  {/* ── Spacer pushes footer down ── */}
                  <div className="flex-1" />

                  {/* ── State & actions ── */}
                  <div className="px-4 pt-3 pb-3 space-y-2">
                    {/* Clone + health + deployed badges */}
                    <div className="flex flex-wrap gap-1.5">
                      {repo?.cloned ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-[var(--color-success-50)] text-[var(--color-success-700)] rounded-[var(--radius-md)] border border-[var(--color-success-200)]">
                          <CheckCircle className="size-3" />
                          Cloned
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-[var(--color-bg-tertiary)] text-[var(--color-fg-tertiary)] rounded-[var(--radius-md)] border border-[var(--color-border-secondary)]">
                          Not cloned
                        </span>
                      )}
                      {repo?.deployed && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-[var(--color-purple-50)] text-[var(--color-purple-700)] rounded-[var(--radius-md)] border border-[var(--color-purple-200)]">
                          <Server className="size-3" />
                          Deployed
                        </span>
                      )}
                      {repo?.health_status && (
                        <span className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-[var(--radius-md)] border ${
                          repo.health_status === 'healthy' ? 'bg-[var(--color-success-50)] text-[var(--color-success-700)] border-[var(--color-success-200)]' :
                          repo.health_status === 'archived' ? 'bg-[var(--color-bg-tertiary)] text-[var(--color-fg-tertiary)] border-[var(--color-border-secondary)]' :
                          repo.health_status === 'not_found' ? 'bg-red-50 text-red-700 border-red-200' :
                          'bg-blue-50 text-blue-700 border-blue-200'
                        }`}>
                          <Heart className="size-3" />
                          {repo.health_status}
                        </span>
                      )}
                    </div>

                    {/* ZIP row */}
                    <div className="flex items-center gap-2">
                      {repo?.zip_status === 'done' ? (
                        <button
                          onClick={(e) => handleDownloadZip(e, repo.id, repo.name)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[length:var(--text-xs)] font-medium rounded-[var(--radius-md)] bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors"
                        >
                          <Download className="size-3" />
                          Download ZIP
                        </button>
                      ) : repo?.zip_status === 'in_progress' || repo?.zip_status === 'pending' ? (
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center justify-between text-[10px] font-medium text-[var(--color-warning-700)]">
                            <span className="inline-flex items-center gap-1">
                              <Loader2 className="size-3 animate-spin" />
                              {zipProgress[repo.id] ? `Zipping… ${zipProgress[repo.id].pct}%` : 'Zipping…'}
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-[var(--color-warning-100)] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[var(--color-warning-400)] rounded-full transition-all duration-300"
                              style={{ width: `${zipProgress[repo.id]?.pct ?? 0}%` }}
                            />
                          </div>
                        </div>
                      ) : repo?.zip_status === 'failed' ? (
                        <button
                          onClick={(e) => handleEnqueueZip(e, repo.id)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[length:var(--text-xs)] font-medium rounded-[var(--radius-md)] bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 transition-colors"
                        >
                          <Download className="size-3" />
                          ZIP failed — retry
                        </button>
                      ) : (
                        <button
                          onClick={(e) => handleEnqueueZip(e, repo.id)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[length:var(--text-xs)] font-medium rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] text-[var(--color-fg-secondary)] hover:bg-[var(--color-bg-tertiary)] border border-[var(--color-border-primary)] transition-colors"
                        >
                          <Download className="size-3" />
                          Get ZIP
                        </button>
                      )}
                      {repo?.cloned && (
                        <button
                          onClick={(e) => handleDeleteClone(e, repo.id, repo.name)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-red-50 text-red-600 hover:bg-red-100 rounded-[var(--radius-md)] border border-red-200 transition-colors"
                          title="Delete local clone"
                        >
                          <Trash2 className="size-3" />
                          Del clone
                        </button>
                      )}
                    </div>
                  </div>

                  {/* ── Footer: category · view button ── */}
                  <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-[var(--color-border-secondary)]">
                    <CategoryBadge category={repo?.category || 'uncategorized'} />
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelectedRepo(repo) }}
                      className="px-2.5 py-1 rounded-[var(--radius-md)] text-[length:var(--text-xs)] font-medium text-[var(--color-brand-600)] bg-[var(--color-brand-50)] hover:bg-[var(--color-brand-100)] border border-[var(--color-brand-200)] transition-colors flex items-center gap-1 flex-shrink-0"
                    >
                      <Eye className="size-3" />
                      View
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-[length:var(--text-sm)] text-[var(--color-fg-tertiary)]">
              Showing {(currentPage - 1) * pageSize + 1} to{' '}
              {Math.min(currentPage * pageSize, totalCount)} of {totalCount}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
                className={cx(
                  'p-2 rounded-[var(--radius-md)] border border-[var(--color-border-primary)] transition-colors',
                  currentPage === 1
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:bg-[var(--color-bg-tertiary)]'
                )}
              >
                <ChevronLeft className="size-5 text-[var(--color-fg-tertiary)]" />
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  let pageNum: number
                  if (totalPages <= 5) {
                    pageNum = i + 1
                  } else if (currentPage <= 3) {
                    pageNum = i + 1
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i
                  } else {
                    pageNum = currentPage - 2 + i
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={cx(
                        'w-10 h-10 text-[length:var(--text-sm)] font-medium rounded-[var(--radius-md)] transition-colors',
                        currentPage === pageNum
                          ? 'bg-[var(--color-brand-50)] text-[var(--color-brand-700)] border border-[var(--color-brand-200)]'
                          : 'text-[var(--color-fg-tertiary)] hover:bg-[var(--color-bg-tertiary)]'
                      )}
                    >
                      {pageNum}
                    </button>
                  )
                })}
              </div>
              <button
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className={cx(
                  'p-2 rounded-[var(--radius-md)] border border-[var(--color-border-primary)] transition-colors',
                  currentPage === totalPages
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:bg-[var(--color-bg-tertiary)]'
                )}
              >
                <ChevronRight className="size-5 text-[var(--color-fg-tertiary)]" />
              </button>
            </div>
          </div>
        </>
      )}

      {/* Category Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-[var(--color-bg-primary)] rounded-[var(--radius-xl)] shadow-[var(--shadow-xl)] p-6 w-full max-w-md">
            <h3 className="text-[length:var(--text-lg)] font-semibold text-[var(--color-fg-primary)] mb-4">
              Change Category
            </h3>
            <p className="text-[length:var(--text-sm)] text-[var(--color-fg-tertiary)] mb-4">
              Update category for {selectedIds.size} selected repositories
            </p>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 text-[length:var(--text-sm)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] bg-[var(--color-bg-primary)] text-[var(--color-fg-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)] mb-4"
            >
              <option value="">Select a category</option>
              {categories.filter(Boolean).map((cat) => (
                <option key={cat} value={cat}>
                  {cat.replace('_', ' ')}
                </option>
              ))}
            </select>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCategoryModal(false)
                  setSelectedCategory('')
                }}
                className="flex-1 px-4 py-2.5 text-[length:var(--text-sm)] font-medium text-[var(--color-fg-secondary)] bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkUpdateCategory}
                disabled={!selectedCategory}
                className={cx(
                  'flex-1 px-4 py-2.5 text-[length:var(--text-sm)] font-medium text-white rounded-[var(--radius-lg)] transition-colors',
                  selectedCategory
                    ? 'bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)]'
                    : 'bg-[var(--color-gray-300)] cursor-not-allowed'
                )}
              >
                Update
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Repository Details Modal */}
      {selectedRepo && (
        <RepositoryDetails
          repository={selectedRepo}
          onClose={() => setSelectedRepo(null)}
          onUpdate={fetchRepositories}
        />
      )}

      {/* README Modal */}
      {readmeRepo && (
        <ReadmeModal
          repoName={readmeRepo.name}
          repoUrl={readmeRepo.url}
          onClose={() => setReadmeRepo(null)}
        />
      )}

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={deleteModal.isOpen}
        title={deleteModal.title}
        message={deleteModal.message}
        itemCount={deleteModal.itemCount}
        onConfirm={deleteModal.onConfirm}
        onCancel={() => setDeleteModal(prev => ({...prev, isOpen: false}))}
      />
    </div>
  )
}

