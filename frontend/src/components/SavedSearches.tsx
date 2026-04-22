import React, { useState, useEffect } from 'react'
import { Star, Edit2, Trash2, X, Plus } from 'lucide-react'
import toast from 'react-hot-toast'

interface SavedSearch {
  id: number
  name: string
  description?: string
  query: string | null
  category: string | null
  language: string | null
  health_status: string | null
  times_used: number
  last_used?: string
  created_at: string
}

interface SavedSearchesProps {
  userId: number
  onSelectSearch: (search: SavedSearch) => void
  isOpen: boolean
  onClose: () => void
}

export function SavedSearches({ userId, onSelectSearch, isOpen, onClose }: SavedSearchesProps) {
  const [searches, setSearches] = useState<SavedSearch[]>([])
  const [loading, setLoading] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    query: '',
    category: '',
    language: '',
    health_status: ''
  })

  useEffect(() => {
    if (isOpen) {
      loadSearches()
    }
  }, [isOpen, userId])

  const loadSearches = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/search/saved?user_id=${userId}`)
      if (response.ok) {
        const data = await response.json()
        setSearches(data)
      }
    } catch (error) {
      console.error('Failed to load saved searches:', error)
    } finally {
      setLoading(false)
    }
  }

  const saveSearch = async () => {
    if (!formData.name.trim()) {
      toast.error('Please enter a name for this search')
      return
    }

    try {
      const url = editingId ? `/api/search/saved/${editingId}?user_id=${userId}` : `/api/search/saved?user_id=${userId}`
      const method = editingId ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (response.ok) {
        toast.success(editingId ? 'Search updated' : 'Search saved')
        loadSearches()
        resetForm()
      } else {
        toast.error('Failed to save search')
      }
    } catch (error) {
      toast.error('Error saving search')
      console.error(error)
    }
  }

  const deleteSearch = async (id: number) => {
    try {
      const response = await fetch(`/api/search/saved/${id}?user_id=${userId}`, {
        method: 'DELETE'
      })
      if (response.ok) {
        setSearches(searches.filter(s => s.id !== id))
        toast.success('Search deleted')
      } else {
        toast.error('Failed to delete search')
      }
    } catch (error) {
      toast.error('Error deleting search')
      console.error(error)
    }
  }

  const useSearch = async (search: SavedSearch) => {
    try {
      await fetch(`/api/search/saved/${search.id}/use?user_id=${userId}`, {
        method: 'POST'
      })
      onSelectSearch(search)
      onClose()
    } catch (error) {
      console.error('Error using saved search:', error)
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      query: '',
      category: '',
      language: '',
      health_status: ''
    })
    setEditingId(null)
    setShowCreateForm(false)
  }

  const startEdit = (search: SavedSearch) => {
    setFormData({
      name: search.name,
      description: search.description || '',
      query: search.query || '',
      category: search.category || '',
      language: search.language || '',
      health_status: search.health_status || ''
    })
    setEditingId(search.id)
    setShowCreateForm(true)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-96 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Star size={20} className="text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Saved Searches</h2>
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
          ) : showCreateForm ? (
            <div className="p-4 border-b border-gray-200">
              <h3 className="font-semibold mb-3">
                {editingId ? 'Edit Search' : 'Create New Search'}
              </h3>
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Search name (e.g., 'React Security Tools')"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <input
                  type="text"
                  placeholder="Description (optional)"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <input
                  type="text"
                  placeholder="Query (e.g., 'security')"
                  value={formData.query}
                  onChange={(e) =>
                    setFormData({ ...formData, query: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Category"
                    value={formData.category}
                    onChange={(e) =>
                      setFormData({ ...formData, category: e.target.value })
                    }
                    className="px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <input
                    type="text"
                    placeholder="Language"
                    value={formData.language}
                    onChange={(e) =>
                      setFormData({ ...formData, language: e.target.value })
                    }
                    className="px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={saveSearch}
                    className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition"
                  >
                    {editingId ? 'Update' : 'Save'} Search
                  </button>
                  <button
                    onClick={resetForm}
                    className="flex-1 px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-900 rounded text-sm font-medium transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : searches.length === 0 ? (
            <div className="p-4 text-center">
              <p className="text-gray-500 mb-3">No saved searches yet</p>
              <button
                onClick={() => setShowCreateForm(true)}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition inline-flex items-center gap-1"
              >
                <Plus size={16} /> Create Search
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {searches.map(search => (
                <div
                  key={search.id}
                  className="p-3 hover:bg-gray-50 transition"
                >
                  <div
                    className="flex-1 cursor-pointer mb-2"
                    onClick={() => useSearch(search)}
                  >
                    <p className="text-sm font-medium text-gray-900">
                      {search.name}
                    </p>
                    {search.description && (
                      <p className="text-xs text-gray-600 mt-1">
                        {search.description}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {search.query && (
                        <span className="inline-block px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded">
                          {search.query}
                        </span>
                      )}
                      {search.category && (
                        <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                          {search.category}
                        </span>
                      )}
                      {search.language && (
                        <span className="inline-block px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">
                          {search.language}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Used {search.times_used} times
                      {search.last_used && ` • Last: ${new Date(search.last_used).toLocaleDateString()}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => startEdit(search)}
                      className="flex-1 px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-xs font-medium transition inline-flex items-center justify-center gap-1"
                    >
                      <Edit2 size={14} /> Edit
                    </button>
                    <button
                      onClick={() => deleteSearch(search.id)}
                      className="flex-1 px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded text-xs font-medium transition inline-flex items-center justify-center gap-1"
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                </div>
              ))}
              {!showCreateForm && (
                <div className="p-3 border-t border-gray-200">
                  <button
                    onClick={() => setShowCreateForm(true)}
                    className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition inline-flex items-center justify-center gap-1"
                  >
                    <Plus size={16} /> Save Current Search
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
