import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Loader, AlertCircle, CheckCircle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import toast from 'react-hot-toast'

export default function GitHubBookmarksCallbackPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { accessToken } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    const handleBookmarksCallback = async () => {
      try {
        const code = searchParams.get('code')
        const state = searchParams.get('state')

        // Verify this is a bookmarks OAuth flow
        if (state !== 'bookmarks') {
          setError('Invalid authorization flow')
          setError('This redirect is not for bookmarks authorization')
          setLoading(false)
          return
        }

        if (!code) {
          setError('No authorization code received from GitHub')
          setLoading(false)
          return
        }

        if (!accessToken) {
          setError('Not authenticated. Please login first.')
          setLoading(false)
          return
        }

        // Exchange code for GitHub token and connect account
        const response = await fetch('http://localhost:8000/api/github-bookmarks/connect', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({ code })
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.detail || 'Failed to connect GitHub bookmarks')
        }

        const data = await response.json()
        
        setSuccess(true)
        setLoading(false)
        
        // Show success message
        toast.success(data.message || 'GitHub account connected successfully!')

        // Redirect to user settings after success animation
        setTimeout(() => navigate('/user-settings'), 1500)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Connection failed'
        setError(errorMessage)
        setLoading(false)
        toast.error(errorMessage)
      }
    }

    handleBookmarksCallback()
  }, [searchParams, navigate, accessToken])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--color-bg-secondary)]">
        <div className="text-center">
          <Loader className="w-12 h-12 text-[var(--color-brand-600)] animate-spin mx-auto mb-4" />
          <p className="text-[var(--color-fg-tertiary)]">Connecting GitHub account for bookmarks...</p>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--color-bg-secondary)]">
        <div className="text-center">
          <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-[var(--color-fg-primary)] mb-2">Connected!</h2>
          <p className="text-[var(--color-fg-tertiary)]">Your GitHub account is connected. Redirecting...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-[var(--color-bg-secondary)]">
      <div className="text-center max-w-md mx-auto px-4">
        <AlertCircle className="w-16 h-16 text-red-600 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-[var(--color-fg-primary)] mb-2">Connection Failed</h2>
        <p className="text-[var(--color-fg-tertiary)] mb-6">{error || 'An error occurred while connecting your GitHub account.'}</p>
        <button
          onClick={() => navigate('/user-settings')}
          className="bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] text-white font-semibold py-2 px-6 rounded-lg transition"
        >
          Back to Settings
        </button>
      </div>
    </div>
  )
}
