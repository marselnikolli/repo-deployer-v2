import { useState } from 'react'
import { Tabs, TabList, Tab, TabPanel } from 'react-aria-components'
import { useNavigate } from 'react-router-dom'
import { BarChart3, Download, Package, LogOut, Plus } from 'lucide-react'
import { Dashboard } from '@/components/Dashboard'
import { ImportBookmarks } from '@/components/ImportBookmarks'
import { RepositoryList } from '@/components/RepositoryList'
import { AddRepository } from '@/components/AddRepository'
import { useTheme } from '@/providers/theme-provider'
import { useAuth } from '@/contexts/AuthContext'
import { cx } from '@/utils/cx'

export function HomePage() {
  const [selectedTab, setSelectedTab] = useState<string>('dashboard')
  const { theme, toggleTheme } = useTheme()
  const { username, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-secondary)]">
      <header className="bg-[var(--color-bg-primary)] shadow-[var(--shadow-sm)] border-b border-[var(--color-border-secondary)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-[length:var(--text-display-xs)] font-semibold text-[var(--color-fg-primary)]">
                Repo Deployer
              </h1>
              <p className="text-[length:var(--text-md)] text-[var(--color-fg-tertiary)] mt-1">
                Professional repository management and deployment
              </p>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-[var(--color-fg-secondary)]">
                Welcome, <span className="font-medium">{username}</span>
              </span>
              <button
                onClick={toggleTheme}
                className="p-2 rounded-[var(--radius-md)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
                aria-label="Toggle theme"
              >
                {theme === 'light' ? '🌙' : '☀️'}
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] bg-red-50 text-red-700 hover:bg-red-100 transition-colors text-sm font-medium"
                aria-label="Logout"
              >
                <LogOut className="size-4" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <Tabs selectedKey={selectedTab} onSelectionChange={(key) => setSelectedTab(key as string)}>
        <nav className="bg-[var(--color-bg-primary)] border-b border-[var(--color-border-secondary)]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <TabList className="flex gap-8" aria-label="Main navigation">
              <Tab
                id="dashboard"
                className={({ isSelected }) =>
                  cx(
                    'flex items-center gap-2 px-1 py-4 text-[length:var(--text-sm)] font-medium border-b-2 transition-colors outline-none cursor-pointer',
                    isSelected
                      ? 'border-[var(--color-brand-500)] text-[var(--color-brand-600)]'
                      : 'border-transparent text-[var(--color-fg-quaternary)] hover:text-[var(--color-fg-secondary)] hover:border-[var(--color-border-primary)]'
                  )
                }
              >
                <BarChart3 className="size-5" />
                Dashboard
              </Tab>
              <Tab
                id="import"
                className={({ isSelected }) =>
                  cx(
                    'flex items-center gap-2 px-1 py-4 text-[length:var(--text-sm)] font-medium border-b-2 transition-colors outline-none cursor-pointer',
                    isSelected
                      ? 'border-[var(--color-brand-500)] text-[var(--color-brand-600)]'
                      : 'border-transparent text-[var(--color-fg-quaternary)] hover:text-[var(--color-fg-secondary)] hover:border-[var(--color-border-primary)]'
                  )
                }
              >
                <Download className="size-5" />
                Import
              </Tab>
              <Tab
                id="repositories"
                className={({ isSelected }) =>
                  cx(
                    'flex items-center gap-2 px-1 py-4 text-[length:var(--text-sm)] font-medium border-b-2 transition-colors outline-none cursor-pointer',
                    isSelected
                      ? 'border-[var(--color-brand-500)] text-[var(--color-brand-600)]'
                      : 'border-transparent text-[var(--color-fg-quaternary)] hover:text-[var(--color-fg-secondary)] hover:border-[var(--color-border-primary)]'
                  )
                }
              >
                <Package className="size-5" />
                Repositories
              </Tab>
              <Tab
                id="add"
                className={({ isSelected }) =>
                  cx(
                    'flex items-center gap-2 px-1 py-4 text-[length:var(--text-sm)] font-medium border-b-2 transition-colors outline-none cursor-pointer',
                    isSelected
                      ? 'border-[var(--color-brand-500)] text-[var(--color-brand-600)]'
                      : 'border-transparent text-[var(--color-fg-quaternary)] hover:text-[var(--color-fg-secondary)] hover:border-[var(--color-border-primary)]'
                  )
                }
              >
                <Plus className="size-5" />
                Add Repository
              </Tab>
            </TabList>
          </div>
        </nav>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <TabPanel id="dashboard">
            <Dashboard />
          </TabPanel>
          <TabPanel id="import">
            <ImportBookmarks />
          </TabPanel>
          <TabPanel id="repositories">
            <RepositoryList />
          </TabPanel>
          <TabPanel id="add">
            <AddRepository onRepositoryAdded={() => setSelectedTab('repositories')} />
          </TabPanel>
        </main>
      </Tabs>
    </div>
  )
}
