import React, { useState, useEffect } from 'react'
import { Search, Filter, ChevronLeft, ChevronRight, Star, Calendar, Code } from 'lucide-react'
import toast from 'react-hot-toast'

interface Repository {
  id: number
  name: string
  url: string
  title?: string
  description?: string
  language?: string
  category?: string
  github_stars?: number
  health_status?: string
  is_fork: boolean
  archived: boolean
  github_updated_at?: string
  github_created_at?: string
}

interface SearchResponse {
  results: Repository[]
  total: number
  limit: number
  offset: number
  page: number
  pages: number
}

interface FilterOptions {
  languages: string[]
  categories: string[]
  min_stars: number
  max_stars: number
  health_statuses: string[]
  sort_options: string[]
}

export function SearchPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState<Repository[]>([])
  const [totalResults, setTotalResults] = useState(0)
  const [loading, setLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null)
  const [showFilters, setShowFilters] = useState(false)

  // Filter state
  const [filters, setFilters] = useState({
    language: '',
    minStars: '',
    maxStars: '',
    healthStatus: '',
    isFork: '',
    isArchived: '',
    category: '',
    sortBy: 'name',
    sortOrder: 'asc'
  })

  const resultsPerPage = 50

  useEffect(() => {
    loadFilterOptions()
  }, [])

  useEffect(() => {
    if (searchQuery || Object.values(filters).some(v => v !== '' && v !== 'name' && v !== 'asc')) {
      performSearch()
    }
  }, [currentPage])

  const loadFilterOptions = async () => {
    try {
      const response = await fetch('/api/search/filters')
      if (response.ok) {
        const data = await response.json()
        setFilterOptions(data)
      }
    } catch (error) {
      console.error('Failed to load filter options:', error)
    }
  }

  const performSearch = async () => {
    setLoading(true)
    try {
      const offset = (currentPage - 1) * resultsPerPage
      const params = new URLSearchParams({
        limit: resultsPerPage.toString(),
        offset: offset.toString(),
        sort_by: filters.sortBy,
        sort_order: filters.sortOrder
      })

      if (searchQuery) params.append('q', searchQuery)
      if (filters.language) params.append('language', filters.language)
      if (filters.minStars) params.append('min_stars', filters.minStars)
      if (filters.maxStars) params.append('max_stars', filters.maxStars)
      if (filters.healthStatus) params.append('health_status', filters.healthStatus)
      if (filters.isFork !== '') params.append('is_fork', filters.isFork)
      if (filters.isArchived !== '') params.append('is_archived', filters.isArchived)
      if (filters.category) params.append('category', filters.category)

      const response = await fetch(`/api/search/repositories?${params}`)
      if (response.ok) {
        const data: SearchResponse = await response.json()
        setResults(data.results)
        setTotalResults(data.total)
      }
    } catch (error) {
      toast.error('Failed to perform search')
      console.error('Search error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setCurrentPage(1)
    performSearch()
  }

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }))
    setCurrentPage(1)
  }

  const resetFilters = () => {
    setFilters({
      language: '',
      minStars: '',
      maxStars: '',
      healthStatus: '',
      isFork: '',
      isArchived: '',
      category: '',
      sortBy: 'name',
      sortOrder: 'asc'
    })
    setCurrentPage(1)
  }

  const getHealthStatusColor = (status?: string) => {
    const colors: Record<string, string> = {
      healthy: 'bg-green-50 text-green-700 border-green-200',
      archived: 'bg-gray-50 text-gray-700 border-gray-200',
      not_found: 'bg-red-50 text-red-700 border-red-200'
    }
    return colors[status || ''] || 'bg-blue-50 text-blue-700 border-blue-200'
  }

  const totalPages = Math.ceil(totalResults / resultsPerPage)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Repository Search</h1>
          
          {/* Search Bar */}
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                placeholder="Search repositories by name, description, or URL..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <Search size={18} className="absolute left-3 top-2.5 text-gray-400" />
            </div>
            <button
              type="submit"
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition"
            >
              Search
            </button>
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={`px-4 py-2 border rounded-lg font-medium transition ${
                showFilters
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Filter size={18} />
            </button>
          </form>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && filterOptions && (
        <div className="bg-white border-b border-gray-200 sticky top-20 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Language Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Language</label>
                <select
                  value={filters.language}
                  onChange={e => handleFilterChange('language', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                >
                  <option value="">All Languages</option>
                  {filterOptions.languages.map(lang => (
                    <option key={lang} value={lang}>{lang}</option>
                  ))}
                </select>
              </div>

              {/* Category Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                <select
                  value={filters.category}
                  onChange={e => handleFilterChange('category', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                >
                  <option value="">All Categories</option>
                  {filterOptions.categories.map(cat => (
                    <option key={cat} value={cat}>{cat.replace(/_/g, ' ').toUpperCase()}</option>
                  ))}
                </select>
              </div>

              {/* Health Status Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Health Status</label>
                <select
                  value={filters.healthStatus}
                  onChange={e => handleFilterChange('healthStatus', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                >
                  <option value="">All Status</option>
                  {filterOptions.health_statuses.map(status => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>

              {/* Min Stars */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Min Stars</label>
                <input
                  type="number"
                  min="0"
                  max={filterOptions.max_stars}
                  value={filters.minStars}
                  onChange={e => handleFilterChange('minStars', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  placeholder="0"
                />
              </div>

              {/* Max Stars */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Max Stars</label>
                <input
                  type="number"
                  min="0"
                  value={filters.maxStars}
                  onChange={e => handleFilterChange('maxStars', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  placeholder={filterOptions.max_stars.toString()}
                />
              </div>

              {/* Fork Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Fork Status</label>
                <select
                  value={filters.isFork}
                  onChange={e => handleFilterChange('isFork', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                >
                  <option value="">All Repos</option>
                  <option value="false">Non-Forks Only</option>
                  <option value="true">Forks Only</option>
                </select>
              </div>

              {/* Archive Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Archive Status</label>
                <select
                  value={filters.isArchived}
                  onChange={e => handleFilterChange('isArchived', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                >
                  <option value="">All Repos</option>
                  <option value="false">Active Only</option>
                  <option value="true">Archived Only</option>
                </select>
              </div>

              {/* Sort By */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Sort By</label>
                <select
                  value={filters.sortBy}
                  onChange={e => handleFilterChange('sortBy', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                >
                  {filterOptions.sort_options.map(opt => (
                    <option key={opt} value={opt}>{opt.replace(/_/g, ' ').charAt(0).toUpperCase() + opt.replace(/_/g, ' ').slice(1)}</option>
                  ))}
                </select>
              </div>

              {/* Sort Order */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Order</label>
                <select
                  value={filters.sortOrder}
                  onChange={e => handleFilterChange('sortOrder', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                >
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
              </div>
            </div>

            {/* Reset Filters Button */}
            <button
              onClick={resetFilters}
              className="mt-4 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-900 rounded-lg font-medium transition"
            >
              Reset Filters
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Results Info */}
        {totalResults > 0 && (
          <div className="mb-6 text-sm text-gray-600">
            Found <span className="font-semibold text-gray-900">{totalResults}</span> repositories
            {searchQuery && <> matching "<span className="font-semibold">{searchQuery}</span>"</>}
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border border-gray-300 border-t-blue-600"></div>
          </div>
        )}

        {/* Results List */}
        {!loading && results.length === 0 && (
          <div className="text-center py-12">
            <Search size={48} className="mx-auto mb-4 text-gray-400" />
            <p className="text-gray-600 text-lg">
              {searchQuery || Object.values(filters).some(v => v !== '' && v !== 'name' && v !== 'asc')
                ? 'No repositories found matching your criteria'
                : 'Enter a search query to get started'}
            </p>
          </div>
        )}

        {!loading && results.length > 0 && (
          <>
            <div className="space-y-3">
              {results.map(repo => (
                <div
                  key={repo.id}
                  className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-gray-900 truncate">
                        {repo.title || repo.name}
                      </h3>
                      <p className="text-sm text-gray-500 truncate">{repo.url}</p>
                      {repo.description && (
                        <p className="text-sm text-gray-600 mt-2 line-clamp-2">{repo.description}</p>
                      )}
                      <div className="flex flex-wrap gap-2 mt-3">
                        {repo.language && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                            <Code size={12} />
                            {repo.language}
                          </span>
                        )}
                        {repo.github_stars !== undefined && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-50 text-yellow-700 rounded text-xs font-medium">
                            <Star size={12} />
                            {repo.github_stars.toLocaleString()}
                          </span>
                        )}
                        {repo.github_updated_at && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs font-medium">
                            <Calendar size={12} />
                            {new Date(repo.github_updated_at).toLocaleDateString()}
                          </span>
                        )}
                        {repo.health_status && (
                          <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium border ${getHealthStatusColor(repo.health_status)}`}>
                            {repo.health_status}
                          </span>
                        )}
                        {repo.is_fork && (
                          <span className="inline-flex items-center px-2 py-1 bg-purple-50 text-purple-700 rounded text-xs font-medium border border-purple-200">
                            Fork
                          </span>
                        )}
                        {repo.archived && (
                          <span className="inline-flex items-center px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium border border-gray-200">
                            Archived
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-between">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                >
                  <ChevronLeft size={16} />
                  Previous
                </button>

                <div className="text-sm text-gray-600">
                  Page <span className="font-semibold">{currentPage}</span> of <span className="font-semibold">{totalPages}</span>
                </div>

                <button
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                >
                  Next
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
