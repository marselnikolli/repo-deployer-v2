import React, { useState, useEffect } from 'react'
import { Clock, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'

interface SearchHistoryItem {
  id: number
  query: string | null
  category: string | null
  language: string | null
  health_status: string | null
  results_count: number
  searched_at: string
}

interface SearchHistoryProps {
  userId: number
  onSelectSearch: (search: Partial<SearchHistoryItem>) => void
  isOpen: boolean
  onClose: () => void
}

export function SearchHistory({ userId, onSelectSearch, isOpen, onClose }: SearchHistoryProps) {
  const [history, setHistory] = useState<SearchHistoryItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen) {
      loadHistory()
    }
  }, [isOpen, userId])

  const loadHistory = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/search/history?user_id=${userId}&limit=20`)
      if (response.ok) {
        const data = await response.json()
        setHistory(data)
      }
    } catch (error) {
      console.error('Failed to load search history:', error)
    } finally {
      setLoading(false)
    }
  }

  const deleteHistory = async (id: number) => {
    try {
      const response = await fetch(`/api/search/history/${id}?user_id=${userId}`, {
        method: 'DELETE'
      })
      if (response.ok) {
        setHistory(history.filter(h => h.id !== id))
        toast.success('Search removed from history')
      } else {
        toast.error('Failed to delete search')
      }
    } catch (error) {
      toast.error('Error deleting search')
      console.error(error)
    }
  }

  const handleSelectSearch = (item: SearchHistoryItem) => {
    onSelectSearch({
      query: item.query,
      category: item.category,
      language: item.language,
      health_status: item.health_status
    })
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] shadow-xl max-w-md w-full mx-4 max-h-96 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border-secondary)]">
          <div className="flex items-center gap-2">
            <Clock size={20} className="text-[var(--color-fg-tertiary)]" />
            <h2 className="text-lg font-semibold text-[var(--color-fg-primary)]">Search History</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[var(--color-bg-tertiary)] rounded transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-[var(--color-fg-quaternary)]">Loading...</div>
          ) : history.length === 0 ? (
            <div className="p-4 text-center text-[var(--color-fg-quaternary)]">
              No search history yet
            </div>
          ) : (
            <div className="divide-y divide-[var(--color-border-tertiary)]">
              {history.map(item => (
                <div
                  key={item.id}
                  className="p-3 hover:bg-[var(--color-bg-secondary)] transition cursor-pointer"
                >
                  <div
                    className="flex-1"
                    onClick={() => handleSelectSearch(item)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--color-fg-primary)] truncate">
                          {item.query || 'All repositories'}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {item.category && (
                            <span className="inline-block px-2 py-0.5 bg-[var(--color-brand-100)] text-[var(--color-brand-700)] text-xs rounded">
                              {item.category}
                            </span>
                          )}
                          {item.language && (
                            <span className="inline-block px-2 py-0.5 bg-[var(--color-success-100)] text-[var(--color-success-700)] text-xs rounded">
                              {item.language}
                            </span>
                          )}
                          {item.health_status && (
                            <span className="inline-block px-2 py-0.5 bg-[var(--color-purple-50)] text-[var(--color-purple-700)] text-xs rounded">
                              {item.health_status}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[var(--color-fg-quaternary)] mt-1">
                          {item.results_count} results •{' '}
                          {new Date(item.searched_at).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteHistory(item.id)
                        }}
                        className="p-1 hover:bg-[var(--color-error-50)] text-[var(--color-error-600)] rounded transition"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
