import { useEffect, useState, useRef, useCallback } from 'react'
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
} from 'lucide-react'
import { useRepositoryStore } from '@/store/useRepositoryStore'
import { repositoryApi, bulkApi, generalApi, searchApi, exportApi, cloneQueueApi } from '@/api/client'
import { cx } from '@/utils/cx'
import toast from 'react-hot-toast'
import { RepositoryDetails } from './RepositoryDetails'
import { DeleteConfirmationModal } from './DeleteConfirmationModal'
import { useKeyboardShortcuts, KEYBOARD_SHORTCUTS } from '@/hooks/useKeyboardShortcuts'

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
  health_status?: string
  last_health_check?: string
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
  const [loading, setLoading] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [categories, setCategories] = useState<string[]>([])
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('')
  const [filterCategory, setFilterCategory] = useState<string | null>(null)
  const [filterCloned, setFilterCloned] = useState<boolean | null>(null)
  const [filterDeployed, setFilterDeployed] = useState<boolean | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [sortBy, setSortBy] = useState<string | null>(null)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null)
  const [focusedIndex, setFocusedIndex] = useState<number>(-1)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [cloneJobs, setCloneJobs] = useState<any[]>([])
  const [isCloning, setIsCloning] = useState(false)
  const [isHealthChecking, setIsHealthChecking] = useState(false)
  const [importJobs, setImportJobs] = useState<any[]>([])
  const [autoCheckProgress, setAutoCheckProgress] = useState<{isRunning: boolean; current: number; total: number; status: string}>({isRunning: false, current: 0, total: 0, status: ''})
  
  // Delete confirmation modal state
  const [deleteModal, setDeleteModal] = useState<{isOpen: boolean; title: string; message: string; itemCount: number; onConfirm: () => void}>({
    isOpen: false,
    title: '',
    message: '',
    itemCount: 0,
    onConfirm: () => {}
  })
  
  const searchInputRef = useRef<HTMLInputElement>(null)
  const clonePollingRef = useRef<NodeJS.Timeout | null>(null)
  const importPollingRef = useRef<NodeJS.Timeout | null>(null)
  const previousImportJobsRef = useRef<any[]>([])

  useEffect(() => {
    fetchRepositories()
    fetchCategories()
  }, [currentPage, filterCategory, filterCloned, filterDeployed, sortBy, sortOrder])

  // Poll for clone job status
  useEffect(() => {
    if (isCloning) {
      clonePollingRef.current = setInterval(async () => {
        try {
          const response = await cloneQueueApi.jobs()
          const jobs = response.data
          setCloneJobs(jobs)

          // Check for newly completed jobs
          const completedJobs = jobs.filter((j: any) => j.status === 'completed')
          const failedJobs = jobs.filter((j: any) => j.status === 'failed')
          const pendingOrInProgress = jobs.filter((j: any) =>
            j.status === 'pending' || j.status === 'in_progress'
          )

          // If all jobs are done, stop polling and refresh
          if (pendingOrInProgress.length === 0 && jobs.length > 0) {
            setIsCloning(false)
            if (completedJobs.length > 0) {
              toast.success(`Cloned ${completedJobs.length} repositories successfully!`)
            }
            if (failedJobs.length > 0) {
              toast.error(`${failedJobs.length} repositories failed to clone`)
            }
            fetchRepositories()
            await cloneQueueApi.clear()
            setCloneJobs([])
          }
        } catch (error) {
          console.error('Error polling clone jobs:', error)
        }
      }, 1500)
    }

    return () => {
      if (clonePollingRef.current) {
        clearInterval(clonePollingRef.current)
      }
    }
  }, [isCloning])

  // Poll for import jobs and auto-trigger health checks when complete
  useEffect(() => {
    // Only start polling if we have authentication
    const token = localStorage.getItem('token')
    if (!token) {
      return
    }

    importPollingRef.current = setInterval(async () => {
      try {
        const response = await generalApi.importJobs()
        const jobs = response.data || []
        console.log('[IMPORT-POLLING] Jobs poll cycle - jobs count:', jobs.length, 'jobs:', jobs)
        
        // Track previous jobs to detect newly completed imports
        const previousJobs = previousImportJobsRef.current
        const wasImporting = previousJobs.some(j => j.status === 'running' || j.status === 'pending')
        const nowRunning = jobs.some(j => j.status === 'running' || j.status === 'pending')
        const justCompleted = wasImporting && !nowRunning && jobs.length > 0
        console.log('[IMPORT-POLLING] Completion detection - wasImporting:', wasImporting, 'nowRunning:', nowRunning, 'justCompleted:', justCompleted, 'previousJobs:', previousJobs)
        
        // Update the ref with current jobs
        previousImportJobsRef.current = jobs
        setImportJobs(jobs)
        
        // Auto-trigger health check when import completes
        if (justCompleted && !autoCheckProgress.isRunning) {
          console.log('[IMPORT-COMPLETE] ===== Import job completed! =====')
          console.log('[IMPORT-COMPLETE] Current autoCheckProgress:', autoCheckProgress)
          console.log('[IMPORT-COMPLETE] wasImporting:', wasImporting)
          console.log('[IMPORT-COMPLETE] nowRunning:', nowRunning)
          console.log('[IMPORT-COMPLETE] justCompleted:', justCompleted)
          console.log('[IMPORT-COMPLETE] jobs count:', jobs.length)
          console.log('[IMPORT-COMPLETE] Job details:', jobs)
          console.log('[IMPORT-COMPLETE] Triggering auto health check...')
          toast.success('Import completed! Starting automatic health and metadata check...')
          triggerAutoHealthCheck()
        } else {
          if (justCompleted) {
            console.log('[IMPORT-POLLING] Skipping auto health check: autoCheckProgress.isRunning is true')
          }
        }
      } catch (error: any) {
        // Only log non-401 errors (401 means user not logged in)
        if (error?.response?.status !== 401) {
          console.error('Error polling import jobs:', error)
        }
      }
    }, 2000)

    return () => {
      if (importPollingRef.current) {
        clearInterval(importPollingRef.current)
      }
    }
  }, [])

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

  // Log health check progress changes for debugging
  useEffect(() => {
    console.log('[DEBUG-AUTOCHECK] autoCheckProgress state changed:', {
      isRunning: autoCheckProgress.isRunning,
      current: autoCheckProgress.current,
      total: autoCheckProgress.total,
      status: autoCheckProgress.status
    })
  }, [autoCheckProgress])

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
    }
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
      // Clear any previous clone jobs first
      await cloneQueueApi.clear()
      setCloneJobs([])
      
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

  const triggerAutoHealthCheck = async () => {
    try {
      console.log('[HEALTH-CHECK-FRONTEND] ===== Starting auto health check =====')
      console.log('[HEALTH-CHECK-FRONTEND] Current autoCheckProgress state:', {
        isRunning: autoCheckProgress.isRunning,
        current: autoCheckProgress.current,
        total: autoCheckProgress.total,
        status: autoCheckProgress.status
      })
      
      setAutoCheckProgress({isRunning: true, current: 0, total: 0, status: 'Fetching repositories...'})
      console.log('[HEALTH-CHECK-FRONTEND] State set to: fetching repositories')
      
      // Fetch all repositories to get all IDs
      console.log('[HEALTH-CHECK-FRONTEND] Calling repositoryApi.list...')
      const allReposResponse = await repositoryApi.list(undefined, 0, 10000)
      console.log('[HEALTH-CHECK-FRONTEND] Response received:', {
        hasData: !!allReposResponse.data,
        dataLength: Array.isArray(allReposResponse.data) ? allReposResponse.data.length : 'not an array',
        fullResponse: allReposResponse
      })
      
      const allRepos = allReposResponse.data || []
      const totalToCheck = allRepos.length
      console.log(`[HEALTH-CHECK-FRONTEND] Found ${totalToCheck} repositories to check`)
      
      if (totalToCheck === 0) {
        console.warn('[HEALTH-CHECK-FRONTEND] No repositories to check - aborting')
        setAutoCheckProgress({isRunning: false, current: 0, total: 0, status: 'No repositories to check'})
        return
      }
      
      setAutoCheckProgress({isRunning: true, current: 0, total: totalToCheck, status: 'Starting health checks...'})
      console.log(`[HEALTH-CHECK-FRONTEND] Initiating health check for ${totalToCheck} repositories`)
      
      // Get all repo IDs
      const allIds = allRepos.map(r => r.id)
      console.log(`[HEALTH-CHECK-FRONTEND] Repository IDs collected: ${allIds.length}`)
      console.log(`[HEALTH-CHECK-FRONTEND] IDs: ${allIds.join(', ')}`)
      
      // Start async health check and get job ID
      console.log('[HEALTH-CHECK-FRONTEND] Calling bulkApi.healthCheck API...')
      const jobResponse = await bulkApi.healthCheck(allIds)
      console.log('[HEALTH-CHECK-FRONTEND] Health check API response:', {
        status: jobResponse?.status,
        data: jobResponse?.data,
        fullResponse: jobResponse
      })
      
      const jobId = jobResponse.data?.job_id
      console.log(`[HEALTH-CHECK-FRONTEND] Extracting job_id from response: "${jobId}"`)
      
      if (!jobId) {
        console.error('[HEALTH-CHECK-FRONTEND] job_id is missing or undefined!')
        console.error('[HEALTH-CHECK-FRONTEND] jobResponse.data:', jobResponse.data)
        throw new Error(`Failed to start health check job - received job_id: ${jobId}`)
      }
      
      console.log(`[HEALTH-CHECK-FRONTEND] Health check job started with ID: ${jobId}`)
      console.log(`[HEALTH-CHECK-FRONTEND] Starting progress polling (every 300ms)...`)
      
      // Poll for progress every 300ms
      let pollCount = 0
      const progressInterval = setInterval(async () => {
        pollCount++
        try {
          const progressResponse = await generalApi.getHealthCheckProgress(jobId)
          const progress = progressResponse.data
          
          if (pollCount % 10 === 0) { // Log every 10 polls (3 seconds) to avoid spam
            console.log(`[HEALTH-CHECK-POLL] Poll #${pollCount}: ${progress.current}/${progress.total} - Status: ${progress.status} - Message: "${progress.message}"`)
          }
          
          // Update state
          setAutoCheckProgress({
            isRunning: progress.status === 'running',
            current: progress.current,
            total: progress.total,
            status: progress.message
          })
          
          // Stop polling when complete
          if (progress.status === 'completed' || progress.status === 'failed') {
            clearInterval(progressInterval)
            console.log(`[HEALTH-CHECK-FRONTEND] Health check ${progress.status} after ${pollCount} polls`)
            console.log(`[HEALTH-CHECK-FRONTEND] Final progress:`, progress)
            
            if (progress.status === 'completed') {
              console.log(`[HEALTH-CHECK-FRONTEND] Summary: ${progress.message}`)
              // Refresh data and show summary
              await new Promise(resolve => setTimeout(resolve, 500))
              fetchRepositories()
              
              toast.success(progress.message)
            } else {
              console.error(`[HEALTH-CHECK-FRONTEND] Health check failed: ${progress.error || 'Unknown error'}`)
              toast.error(`Health check failed: ${progress.error || 'Unknown error'}`)
            }
            
            setAutoCheckProgress({isRunning: false, current: 0, total: 0, status: ''})
          }
        } catch (pollError) {
          console.error(`[HEALTH-CHECK-POLL-ERROR] Poll attempt #${pollCount} failed:`, pollError)
          // Continue polling on error, don't break
        }
      }, 300)
      
      // Timeout safety: stop polling after 30 minutes
      setTimeout(() => {
        clearInterval(progressInterval)
        console.warn('[HEALTH-CHECK-FRONTEND] Health check polling timed out after 30 minutes')
        setAutoCheckProgress({isRunning: false, current: 0, total: 0, status: ''})
      }, 30 * 60 * 1000)
    } catch (error: any) {
      console.error('[HEALTH-CHECK-FRONTEND] ===== Error during auto health check =====')
      console.error('[HEALTH-CHECK-FRONTEND] Error object:', error)
      console.error('[HEALTH-CHECK-FRONTEND] Error message:', error?.message)
      console.error('[HEALTH-CHECK-FRONTEND] Error response:', error?.response)
      console.error('[HEALTH-CHECK-FRONTEND] Full error:', JSON.stringify(error, null, 2))
      
      setAutoCheckProgress({isRunning: false, current: 0, total: 0, status: ''})
      toast.error(`Auto health check failed: ${error?.message || 'Unknown error'}`)
    }
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
          <span className="text-[length:var(--text-sm)] text-[var(--color-fg-tertiary)]">
            {totalCount} total
          </span>
        </div>
      </div>

      {/* Debug: Show state if any health check is running */}
      {process.env.NODE_ENV === 'development' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs">
          <div className="font-mono text-gray-700">
            <div>autoCheckProgress.isRunning: <strong>{String(autoCheckProgress.isRunning)}</strong></div>
            <div>autoCheckProgress.current: <strong>{autoCheckProgress.current}</strong></div>
            <div>autoCheckProgress.total: <strong>{autoCheckProgress.total}</strong></div>
            <div>autoCheckProgress.status: <strong>{autoCheckProgress.status || '(empty)'}</strong></div>
          </div>
        </div>
      )}

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
            className="px-3 py-2 text-[length:var(--text-sm)] border border-[var(--color-border-primary)] rounded-[var(--radius-md)] bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 hover:border-[var(--color-brand-300)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-500)]"
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
            className="px-3 py-2 text-[length:var(--text-sm)] border border-[var(--color-border-primary)] rounded-[var(--radius-md)] bg-white dark:bg-slate-800 text-[var(--color-fg-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-500)] min-w-[200px]"
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
              className="px-4 py-2 text-[length:var(--text-sm)] font-medium text-white bg-red-600 hover:bg-red-700 disabled:bg-gray-400 border border-red-700 rounded-[var(--radius-md)] transition-colors flex items-center gap-2"
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

      {repositories.length === 0 ? (
        <div className="bg-[var(--color-bg-primary)] rounded-[var(--radius-xl)] border border-[var(--color-border-secondary)] p-12 text-center">
          <p className="text-[length:var(--text-md)] text-[var(--color-fg-quaternary)]">
            No repositories found. Start by importing bookmarks!
          </p>
        </div>
      ) : (
        <>
          {/* Auto-check progress indicator */}
          {autoCheckProgress.isRunning ? (
            <div className="mb-4 bg-[var(--color-info-50)] border border-[var(--color-info-200)] rounded-[var(--radius-lg)] p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-[length:var(--text-sm)] font-semibold text-[var(--color-info-700)] mb-2">
                    {autoCheckProgress.status || 'Health check in progress...'}
                  </p>
                  <div className="w-full bg-[var(--color-info-200)] rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-[var(--color-info-600)] h-full transition-all duration-300 ease-out"
                      style={{
                        width: autoCheckProgress.total > 0 ? `${(autoCheckProgress.current / autoCheckProgress.total) * 100}%` : '0%'
                      }}
                    />
                  </div>
                  {autoCheckProgress.total > 0 && (
                    <p className="text-[length:var(--text-xs)] text-[var(--color-info-700)] mt-2">
                      {autoCheckProgress.current} of {autoCheckProgress.total} repositories checked
                    </p>
                  )}
                </div>
                <Loader2 className="size-5 text-[var(--color-info-600)] flex-shrink-0 animate-spin" />
              </div>
            </div>
          ) : null}

          {/* Table */}
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
                          <p className="text-[length:var(--text-sm)] font-medium text-[var(--color-fg-primary)]">
                            {repo?.name || 'Unknown'}
                          </p>
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
                        {/* Cloning state */}
                        <div className="flex items-center gap-2">
                          {repo?.cloned && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 text-[length:var(--text-xs)] font-medium bg-[var(--color-success-50)] text-[var(--color-success-700)] rounded-[var(--radius-md)]">
                              <CheckCircle className="size-3" />
                              Cloned
                            </span>
                          )}
                          {!repo.cloned && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 text-[length:var(--text-xs)] font-medium bg-gray-100 text-gray-600 rounded-[var(--radius-md)]">
                              Not cloned
                            </span>
                          )}
                        </div>
                        {/* Health status badge */}
                        {repo?.health_status && (
                          <span className={`inline-flex items-center gap-1 px-2 py-1 text-[length:var(--text-xs)] font-medium rounded-[var(--radius-md)] w-fit ${
                            repo.health_status === 'healthy' ? 'bg-green-100 text-green-700' :
                            repo.health_status === 'archived' ? 'bg-gray-100 text-gray-700' :
                            repo.health_status === 'not_found' ? 'bg-red-100 text-red-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            <Heart className="size-3" />
                            {repo.health_status}
                          </span>
                        )}
                        {/* Deployed status */}
                        {repo?.deployed && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 text-[length:var(--text-xs)] font-medium bg-[var(--color-purple-50)] text-[var(--color-purple-700)] rounded-[var(--radius-md)] w-fit">
                            <Server className="size-3" />
                            Deployed
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 min-w-[100px]">
                      <CategoryBadge category={repo?.category || 'uncategorized'} />
                    </td>
                    <td className="px-4 py-3 min-w-[150px]">
                      <div className="flex items-center gap-2 text-[length:var(--text-xs)] text-[var(--color-fg-secondary)]">
                        {repo?.stars !== undefined && repo?.stars > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <Star className="size-3 text-yellow-500" />
                            {repo.stars}
                          </span>
                        )}
                        {repo?.forks !== undefined && repo?.forks > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <GitFork className="size-3 text-[var(--color-fg-tertiary)]" />
                            {repo.forks}
                          </span>
                        )}
                        {repo?.language && (
                          <span className="px-2 py-1 bg-[var(--color-bg-secondary)] rounded-[var(--radius-sm)]">
                            {repo.language}
                          </span>
                        )}
                        {!repo?.language && (!repo?.stars || repo.stars === 0) && (!repo?.forks || repo.forks === 0) && (
                          <span className="text-[var(--color-fg-quaternary)]">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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

interface CategoryBadgeProps {
  category: string
}

const categoryColors: Record<string, { bg: string; text: string }> = {
  security: { bg: 'bg-[var(--color-error-50)]', text: 'text-[var(--color-error-700)]' },
  ci_cd: { bg: 'bg-[var(--color-purple-50)]', text: 'text-[var(--color-purple-700)]' },
  database: { bg: 'bg-[var(--color-success-50)]', text: 'text-[var(--color-success-700)]' },
  devops: { bg: 'bg-[var(--color-orange-50)]', text: 'text-[var(--color-orange-700)]' },
  api: { bg: 'bg-[var(--color-brand-50)]', text: 'text-[var(--color-brand-700)]' },
  frontend: { bg: 'bg-[var(--color-pink-50)]', text: 'text-[var(--color-pink-700)]' },
  backend: { bg: 'bg-[var(--color-indigo-50)]', text: 'text-[var(--color-indigo-700)]' },
  ml_ai: { bg: 'bg-[var(--color-warning-50)]', text: 'text-[var(--color-warning-700)]' },
  default: { bg: 'bg-[var(--color-gray-100)]', text: 'text-[var(--color-gray-700)]' },
}

function CategoryBadge({ category }: CategoryBadgeProps) {
  const colors = categoryColors[category] || categoryColors.default

  return (
    <span
      className={cx(
        'inline-block px-2.5 py-1 text-[length:var(--text-xs)] font-medium rounded-[var(--radius-full)] capitalize',
        colors.bg,
        colors.text
      )}
    >
      {category.replace('_', ' ')}
    </span>
  )
}
