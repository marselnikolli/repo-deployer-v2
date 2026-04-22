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
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-96 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Clock size={20} className="text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Search History</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-gray-500">Loading...</div>
          ) : history.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              No search history yet
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {history.map(item => (
                <div
                  key={item.id}
                  className="p-3 hover:bg-gray-50 transition cursor-pointer"
                >
                  <div
                    className="flex-1"
                    onClick={() => handleSelectSearch(item)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {item.query || 'All repositories'}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {item.category && (
                            <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                              {item.category}
                            </span>
                          )}
                          {item.language && (
                            <span className="inline-block px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">
                              {item.language}
                            </span>
                          )}
                          {item.health_status && (
                            <span className="inline-block px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">
                              {item.health_status}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {item.results_count} results •{' '}
                          {new Date(item.searched_at).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteHistory(item.id)
                        }}
                        className="p-1 hover:bg-red-50 text-red-600 rounded transition"
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
