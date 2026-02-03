import React from 'react'
import { Dashboard } from '../components/Dashboard'
import { ImportBookmarks } from '../components/ImportBookmarks'
import { RepositoryList } from '../components/RepositoryList'

export const HomePage: React.FC = () => {
  const [tab, setTab] = React.useState<'dashboard' | 'import' | 'repositories'>('dashboard')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-gray-900">🚀 Repo Deployer</h1>
          <p className="text-gray-600 mt-1">Professional repository management and deployment</p>
        </div>
      </header>

      <nav className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 flex gap-8">
          <button
            onClick={() => setTab('dashboard')}
            className={`px-4 py-4 font-medium border-b-2 transition-colors ${
              tab === 'dashboard'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            📊 Dashboard
          </button>
          <button
            onClick={() => setTab('import')}
            className={`px-4 py-4 font-medium border-b-2 transition-colors ${
              tab === 'import'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            📥 Import
          </button>
          <button
            onClick={() => setTab('repositories')}
            className={`px-4 py-4 font-medium border-b-2 transition-colors ${
              tab === 'repositories'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            📦 Repositories
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'import' && <ImportBookmarks />}
        {tab === 'repositories' && <RepositoryList />}
      </main>
    </div>
  )
}
