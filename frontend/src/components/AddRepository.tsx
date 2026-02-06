import { useState, useEffect, useRef } from 'react'
import { repositoryApi } from '@/api/client'
import toast from 'react-hot-toast'

// Map GitHub topics to categories
const TOPIC_TO_CATEGORY: Record<string, string> = {
  'security': 'security',
  'ci': 'ci_cd',
  'ci-cd': 'ci_cd',
  'cicd': 'ci_cd',
  'database': 'database',
  'db': 'database',
  'devops': 'devops',
  'docker': 'devops',
  'kubernetes': 'devops',
  'api': 'api',
  'rest': 'api',
  'graphql': 'api',
  'frontend': 'frontend',
  'react': 'frontend',
  'vue': 'frontend',
  'angular': 'frontend',
  'backend': 'backend',
  'nodejs': 'backend',
  'python': 'backend',
  'go': 'backend',
  'rust': 'backend',
  'java': 'backend',
  'machine-learning': 'ml_ai',
  'ml': 'ml_ai',
  'ai': 'ml_ai',
  'artificial-intelligence': 'ml_ai',
}

export function AddRepository({ onRepositoryAdded }: { onRepositoryAdded: () => void }) {
  const [loading, setLoading] = useState(false)
  const [fetchingMetadata, setFetchingMetadata] = useState(false)
  const [urlValidated, setUrlValidated] = useState(false)
  const [urlValidationError, setUrlValidationError] = useState<string | null>(null)
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    title: '',
    category: 'other',
    description: '',
  })

  // Extract owner and repo from GitHub URL
  const extractRepoInfo = (url: string): { owner: string; repo: string } | null => {
    try {
      const urlObj = new URL(url)
      const pathname = urlObj.pathname.toLowerCase()
      const parts = pathname.split('/').filter(p => p)
      
      if (parts.length >= 2 && urlObj.hostname.includes('github.com')) {
        return {
          owner: parts[0],
          repo: parts[1].replace('.git', ''),
        }
      }
    } catch {
      return null
    }
    return null
  }

  // Fetch repository metadata from GitHub API
  const fetchRepositoryMetadata = async (url: string) => {
    const repoInfo = extractRepoInfo(url)
    if (!repoInfo) {
      setUrlValidated(false)
      setUrlValidationError('Invalid GitHub URL format')
      return
    }

    setFetchingMetadata(true)
    setUrlValidationError(null)
    try {
      const response = await fetch(
        `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}`,
        {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
          },
        }
      )

      if (!response.ok) {
        setUrlValidated(false)
        setUrlValidationError('Repository not found on GitHub')
        setFetchingMetadata(false)
        return
      }

      const data = await response.json()

      // Auto-populate name if empty
      setFormData(prev => ({
        ...prev,
        name: prev.name || repoInfo.repo,
        title: prev.title || data.name || repoInfo.repo,
        description: data.description || prev.description || '',
      }))

      // Detect category from topics
      if (data.topics && Array.isArray(data.topics) && data.topics.length > 0) {
        for (const topic of data.topics) {
          const category = TOPIC_TO_CATEGORY[topic.toLowerCase()]
          if (category) {
            setFormData(prev => ({
              ...prev,
              category,
            }))
            break // Use the first matching topic
          }
        }
      }

      // Mark URL as validated
      setUrlValidated(true)
    } catch (error) {
      console.debug('Failed to fetch GitHub metadata:', error)
      setUrlValidated(false)
      setUrlValidationError('Failed to validate repository')
    } finally {
      setFetchingMetadata(false)
    }
  }

  // Debounced URL change handler
  useEffect(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current)
    }

    if (formData.url && formData.url.includes('github.com')) {
      debounceTimeoutRef.current = setTimeout(() => {
        fetchRepositoryMetadata(formData.url)
      }, 800) // Wait 800ms after user stops typing
    }

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current)
      }
    }
  }, [formData.url])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validation
    if (!formData.name.trim()) {
      toast.error('Repository name is required')
      return
    }
    if (!formData.url.trim()) {
      toast.error('Repository URL is required')
      return
    }

    // Validate GitHub URL
    if (!formData.url.includes('github.com')) {
      toast.error('URL must be a GitHub repository URL')
      return
    }

    // Check if URL was validated
    if (!urlValidated) {
      toast.error('Please enter a valid GitHub repository URL')
      return
    }

    try {
      setLoading(true)
      await repositoryApi.create({
        name: formData.name.trim(),
        url: formData.url.trim(),
        title: formData.title.trim() || formData.name.trim(),
        category: formData.category,
        description: formData.description.trim(),
      })

      toast.success('Repository added successfully!')
      
      // Reset form
      setFormData({
        name: '',
        url: '',
        title: '',
        category: 'other',
        description: '',
      })
      setUrlValidated(false)
      setUrlValidationError(null)

      // Refresh repository list
      onRepositoryAdded()
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to add repository')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[length:var(--text-display-xs)] font-semibold text-[var(--color-fg-primary)]">
          Add Repository Manually
        </h2>
        <p className="text-[length:var(--text-sm)] text-[var(--color-fg-tertiary)] mt-1">
          Manually add a GitHub repository to your collection
        </p>
      </div>

      {/* Info notification */}
      <div className="p-4 rounded-[var(--radius-md)] bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
        <div className="flex gap-3">
          <div className="flex-shrink-0">
            <span className="text-lg text-blue-600 dark:text-blue-400">ℹ️</span>
          </div>
          <div>
            <h3 className="text-[length:var(--text-sm)] font-semibold text-blue-900 dark:text-blue-200">Start with GitHub URL</h3>
            <p className="text-[length:var(--text-sm)] text-blue-800 dark:text-blue-300 mt-1">
              Enter a valid GitHub repository URL first. The form will automatically validate the repository and populate the other fields (name, title, description, and category) for you.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
        <div>
          <label htmlFor="name" className="block text-[length:var(--text-sm)] font-medium text-[var(--color-fg-primary)] mb-1">
            Repository Name *
          </label>
          <input
            id="name"
            name="name"
            type="text"
            value={formData.name}
            onChange={handleInputChange}
            placeholder="e.g., my-awesome-repo"
            className="w-full px-4 py-2 text-[length:var(--text-sm)] border border-[var(--color-border-primary)] rounded-[var(--radius-md)] bg-[var(--color-bg-primary)] dark:bg-[var(--color-bg-primary)] text-[var(--color-fg-primary)] dark:text-[var(--color-fg-primary)] placeholder-[var(--color-fg-quaternary)] dark:placeholder-[var(--color-fg-quaternary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-500)]"
            required
          />
        </div>

        <div>
          <label htmlFor="url" className="block text-[length:var(--text-sm)] font-medium text-[var(--color-fg-primary)] mb-1">
            GitHub URL *
          </label>
          <div className="relative">
            <input
              id="url"
              name="url"
              type="url"
              value={formData.url}
              onChange={handleInputChange}
              placeholder="e.g., https://github.com/username/repo-name"
              className={`w-full px-4 py-2 text-[length:var(--text-sm)] border rounded-[var(--radius-md)] bg-[var(--color-bg-primary)] dark:bg-[var(--color-bg-primary)] text-[var(--color-fg-primary)] dark:text-[var(--color-fg-primary)] placeholder-[var(--color-fg-quaternary)] dark:placeholder-[var(--color-fg-quaternary)] focus:outline-none focus:ring-1 ${
                urlValidationError ? 'border-red-500 focus:ring-red-500' : 'border-[var(--color-border-primary)] focus:ring-[var(--color-brand-500)]'
              } ${urlValidated && !urlValidationError ? 'border-green-500 focus:ring-green-500' : ''}`}
              required
            />
            {fetchingMetadata && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <div className="animate-spin">
                  <span className="text-sm text-[var(--color-brand-600)]">⟳</span>
                </div>
              </div>
            )}
            {!fetchingMetadata && urlValidated && !urlValidationError && formData.url && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <span className="text-lg text-green-500">✓</span>
              </div>
            )}
            {!fetchingMetadata && urlValidationError && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <span className="text-lg text-red-500">✕</span>
              </div>
            )}
          </div>
          {fetchingMetadata && (
            <p className="text-xs text-[var(--color-fg-quaternary)] mt-1">Validating repository...</p>
          )}
          {urlValidationError && (
            <p className="text-xs text-red-500 mt-1">{urlValidationError}</p>
          )}
          {urlValidated && !urlValidationError && (
            <p className="text-xs text-green-600 mt-1">✓ Repository found and validated</p>
          )}
        </div>

        <div>
          <label htmlFor="title" className="block text-[length:var(--text-sm)] font-medium text-[var(--color-fg-primary)] mb-1">
            Title
          </label>
          <input
            id="title"
            name="title"
            type="text"
            value={formData.title}
            onChange={handleInputChange}
            placeholder="e.g., My Awesome Repository"
            className="w-full px-4 py-2 text-[length:var(--text-sm)] border border-[var(--color-border-primary)] rounded-[var(--radius-md)] bg-[var(--color-bg-primary)] dark:bg-[var(--color-bg-primary)] text-[var(--color-fg-primary)] dark:text-[var(--color-fg-primary)] placeholder-[var(--color-fg-quaternary)] dark:placeholder-[var(--color-fg-quaternary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-500)]"
          />
        </div>

        <div>
          <label htmlFor="category" className="block text-[length:var(--text-sm)] font-medium text-[var(--color-fg-primary)] mb-1">
            Category
            {formData.category !== 'other' && fetchingMetadata === false && (
              <span className="text-[length:var(--text-xs)] text-[var(--color-brand-600)] ml-2">(auto-detected)</span>
            )}
          </label>
          <select
            id="category"
            name="category"
            value={formData.category}
            onChange={handleInputChange}
            className="w-full px-4 py-2 text-[length:var(--text-sm)] border border-[var(--color-border-primary)] rounded-[var(--radius-md)] bg-[var(--color-bg-primary)] dark:bg-[var(--color-bg-primary)] text-[var(--color-fg-primary)] dark:text-[var(--color-fg-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-500)]"
          >
            <option value="security">Security</option>
            <option value="ci_cd">CI/CD</option>
            <option value="database">Database</option>
            <option value="devops">DevOps</option>
            <option value="api">API</option>
            <option value="frontend">Frontend</option>
            <option value="backend">Backend</option>
            <option value="ml_ai">ML/AI</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div>
          <label htmlFor="description" className="block text-[length:var(--text-sm)] font-medium text-[var(--color-fg-primary)] mb-1">
            Description
            {formData.description && fetchingMetadata === false && (
              <span className="text-[length:var(--text-xs)] text-[var(--color-brand-600)] ml-2">(auto-filled)</span>
            )}
          </label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            placeholder="Add a description for this repository"
            rows={3}
            className="w-full px-4 py-2 text-[length:var(--text-sm)] border border-[var(--color-border-primary)] rounded-[var(--radius-md)] bg-[var(--color-bg-primary)] dark:bg-[var(--color-bg-primary)] text-[var(--color-fg-primary)] dark:text-[var(--color-fg-primary)] placeholder-[var(--color-fg-quaternary)] dark:placeholder-[var(--color-fg-quaternary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-500)]"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !urlValidated}
          className={`px-6 py-2 text-[length:var(--text-sm)] font-medium text-[color:var(--color-fg-white)] rounded-[var(--radius-md)] transition-colors ${
            loading || !urlValidated
              ? 'bg-[var(--color-fg-disabled)] cursor-not-allowed'
              : 'bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)]'
          }`}
        >
          {loading ? 'Adding...' : 'Add Repository'}
        </button>
      </form>
    </div>
  )
}
