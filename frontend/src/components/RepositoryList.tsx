import React, { useEffect, useState } from 'react'
import { useRepositoryStore } from '../store/useRepositoryStore'
import { repositoryApi } from '../api/client'
import toast from 'react-hot-toast'

export const RepositoryList: React.FC = () => {
  const { repositories, setRepositories, currentPage, pageSize } = useRepositoryStore()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchRepositories()
  }, [currentPage])

  const fetchRepositories = async () => {
    try {
      setLoading(true)
      const skip = (currentPage - 1) * pageSize
      const response = await repositoryApi.list(undefined, skip, pageSize)
      setRepositories(response.data)
    } catch (error) {
      toast.error('Failed to fetch repositories')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-gray-900">Repositories</h2>
      
      {repositories.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p>No repositories found. Start by importing bookmarks!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {repositories.map((repo) => (
            <RepositoryCard key={repo.id} repository={repo} />
          ))}
        </div>
      )}
    </div>
  )
}

interface RepositoryCardProps {
  repository: any
}

const RepositoryCard: React.FC<RepositoryCardProps> = ({ repository }) => {
  return (
    <div className="bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow">
      <h3 className="font-bold text-lg text-gray-900 truncate">{repository.name}</h3>
      
      <p className="text-sm text-gray-600 mt-1">{repository.title}</p>
      
      <div className="mt-3 flex items-center gap-2">
        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getCategoryColor(repository.category)}`}>
          {repository.category}
        </span>
      </div>
      
      <div className="mt-3 flex items-center gap-2">
        {repository.cloned && (
          <span className="inline-block px-2 py-1 text-xs bg-green-100 text-green-800 rounded">
            ✓ Cloned
          </span>
        )}
        {repository.deployed && (
          <span className="inline-block px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
            🐳 Deployed
          </span>
        )}
      </div>
      
      <a
        href={repository.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 block text-blue-600 hover:text-blue-800 text-sm truncate"
      >
        {repository.url}
      </a>
    </div>
  )
}

function getCategoryColor(category: string): string {
  const colors: { [key: string]: string } = {
    security: 'bg-red-100 text-red-800',
    ci_cd: 'bg-purple-100 text-purple-800',
    database: 'bg-green-100 text-green-800',
    devops: 'bg-orange-100 text-orange-800',
    api: 'bg-blue-100 text-blue-800',
    frontend: 'bg-pink-100 text-pink-800',
    backend: 'bg-indigo-100 text-indigo-800',
    ml_ai: 'bg-yellow-100 text-yellow-800',
    default: 'bg-gray-100 text-gray-800'
  }
  return colors[category] || colors.default
}
