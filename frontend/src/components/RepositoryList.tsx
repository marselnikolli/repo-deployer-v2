import { useEffect, useState } from 'react'
import {
  CheckCircle,
  Server,
  ExternalLink,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Folder,
} from 'lucide-react'
import { useRepositoryStore } from '@/store/useRepositoryStore'
import { repositoryApi, bulkApi, generalApi } from '@/api/client'
import { cx } from '@/utils/cx'
import toast from 'react-hot-toast'

interface Repository {
  id: number
  name: string
  title: string
  url: string
  category: string
  cloned: boolean
  deployed: boolean
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

  useEffect(() => {
    fetchRepositories()
    fetchCategories()
  }, [currentPage])

  const fetchRepositories = async () => {
    try {
      setLoading(true)
      const skip = (currentPage - 1) * pageSize
      const response = await repositoryApi.list(undefined, skip, pageSize)
      setRepositories(response.data)
      // For total count, fetch all (or use a separate endpoint)
      const allResponse = await repositoryApi.list(undefined, 0, 10000)
      setTotalCount(allResponse.data.length)
    } catch {
      toast.error('Failed to fetch repositories')
    } finally {
      setLoading(false)
    }
  }

  const fetchCategories = async () => {
    try {
      const response = await generalApi.categories()
      setCategories(response.data.map((c: { name: string }) => c.name))
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

    if (!confirm(`Delete ${selectedIds.size} repositories?`)) return

    try {
      await bulkApi.delete(Array.from(selectedIds))
      toast.success(`Deleted ${selectedIds.size} repositories`)
      clearSelection()
      fetchRepositories()
    } catch {
      toast.error('Failed to delete repositories')
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

  const totalPages = Math.ceil(totalCount / pageSize)

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
        <span className="text-[length:var(--text-sm)] text-[var(--color-fg-tertiary)]">
          {totalCount} total
        </span>
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
              className="px-3 py-1.5 text-[length:var(--text-sm)] font-medium text-[var(--color-brand-700)] bg-white border border-[var(--color-brand-300)] rounded-[var(--radius-md)] hover:bg-[var(--color-brand-100)] transition-colors"
            >
              <Folder className="size-4 inline mr-1" />
              Change Category
            </button>
            <button
              onClick={handleBulkDelete}
              className="px-3 py-1.5 text-[length:var(--text-sm)] font-medium text-[var(--color-error-700)] bg-white border border-[var(--color-error-300)] rounded-[var(--radius-md)] hover:bg-[var(--color-error-50)] transition-colors"
            >
              <Trash01 className="size-4 inline mr-1" />
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

      {repositories.length === 0 ? (
        <div className="bg-[var(--color-bg-primary)] rounded-[var(--radius-xl)] border border-[var(--color-border-secondary)] p-12 text-center">
          <p className="text-[length:var(--text-md)] text-[var(--color-fg-quaternary)]">
            No repositories found. Start by importing bookmarks!
          </p>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="bg-[var(--color-bg-primary)] rounded-[var(--radius-xl)] shadow-[var(--shadow-sm)] border border-[var(--color-border-secondary)] overflow-hidden">
            <table className="w-full">
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
                  <th className="px-4 py-3 text-left text-[length:var(--text-xs)] font-semibold text-[var(--color-fg-tertiary)] uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-[length:var(--text-xs)] font-semibold text-[var(--color-fg-tertiary)] uppercase tracking-wider">
                    URL
                  </th>
                  <th className="px-4 py-3 text-left text-[length:var(--text-xs)] font-semibold text-[var(--color-fg-tertiary)] uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-4 py-3 text-left text-[length:var(--text-xs)] font-semibold text-[var(--color-fg-tertiary)] uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-secondary)]">
                {repositories?.filter(repo => repo != null).map((repo: Repository) => (
                  <tr
                    key={repo?.id || Math.random()}
                    className={cx(
                      'hover:bg-[var(--color-bg-secondary)] transition-colors',
                      selectedIds.has(repo?.id) && 'bg-[var(--color-brand-25)]'
                    )}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={repo?.id ? selectedIds.has(repo.id) : false}
                        onChange={() => repo?.id && toggleSelection(repo.id)}
                        className="w-4 h-4 rounded border-[var(--color-border-primary)] text-[var(--color-brand-600)] focus:ring-[var(--color-brand-500)]"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-[length:var(--text-sm)] font-medium text-[var(--color-fg-primary)]">
                          {repo?.name || 'Unknown'}
                        </p>
                        <p className="text-[length:var(--text-xs)] text-[var(--color-fg-tertiary)] truncate max-w-xs">
                          {repo?.title || 'No title'}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={repo?.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[length:var(--text-sm)] text-[var(--color-brand-600)] hover:text-[var(--color-brand-700)] max-w-xs truncate"
                      >
                        <LinkExternal02 className="size-4 flex-shrink-0" />
                        <span className="truncate">{repo?.url || 'No URL'}</span>
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      <CategoryBadge category={repo?.category || 'uncategorized'} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {repo?.cloned && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 text-[length:var(--text-xs)] font-medium bg-[var(--color-success-50)] text-[var(--color-success-700)] rounded-[var(--radius-md)]">
                            <CheckCircle className="size-3" />
                            Cloned
                          </span>
                        )}
                        {repo?.deployed && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 text-[length:var(--text-xs)] font-medium bg-[var(--color-purple-50)] text-[var(--color-purple-700)] rounded-[var(--radius-md)]">
                            <Server01 className="size-3" />
                            Deployed
                          </span>
                        )}
                        {!repo.cloned && !repo.deployed && (
                          <span className="text-[length:var(--text-xs)] text-[var(--color-fg-quaternary)]">
                            —
                          </span>
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
              {categories.map((cat) => (
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
