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
    if (!repoInfo) return

    setFetchingMetadata(true)
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
        setFetchingMetadata(false)
        return
      }

      const data = await response.json()

      // Update description if available
      if (data.description) {
        setFormData(prev => ({
          ...prev,
          description: data.description || '',
        }))
      }

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
    } catch (error) {
      // Silently fail - GitHub API might be rate limited or URL might be invalid
      console.debug('Failed to fetch GitHub metadata:', error)
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
              className="w-full px-4 py-2 text-[length:var(--text-sm)] border border-[var(--color-border-primary)] rounded-[var(--radius-md)] bg-[var(--color-bg-primary)] dark:bg-[var(--color-bg-primary)] text-[var(--color-fg-primary)] dark:text-[var(--color-fg-primary)] placeholder-[var(--color-fg-quaternary)] dark:placeholder-[var(--color-fg-quaternary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-500)]"
              required
            />
            {fetchingMetadata && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <div className="animate-spin">
                  <span className="text-sm text-[var(--color-brand-600)]">⟳</span>
                </div>
              </div>
            )}
          </div>
          {fetchingMetadata && (
            <p className="text-xs text-[var(--color-fg-quaternary)] mt-1">Fetching repository info...</p>
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
          disabled={loading}
          className="px-6 py-2 text-[length:var(--text-sm)] font-medium text-[color:var(--color-fg-white)] bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] disabled:bg-[var(--color-fg-disabled)] rounded-[var(--radius-md)] transition-colors"
        >
          {loading ? 'Adding...' : 'Add Repository'}
        </button>
      </form>
    </div>
  )
}
