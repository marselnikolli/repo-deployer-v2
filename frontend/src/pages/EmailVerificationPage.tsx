import { useState, useEffect } from 'react'
import { CheckCircle, AlertCircle, Loader } from 'lucide-react'
import { useSearchParams, useNavigate } from 'react-router-dom'

export default function EmailVerificationPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const token = searchParams.get('token')

  useEffect(() => {
    const verifyEmail = async () => {
      if (!token) {
        setError('Invalid verification link')
        setLoading(false)
        return
      }

      try {
        const response = await fetch('/api/auth/email-verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.detail || 'Email verification failed')
        }

        const data = await response.json()

        // Optionally auto-login after verification
        if (data.user) {
          localStorage.setItem('auth_token', data.access_token || '')
          localStorage.setItem('auth_type', 'Bearer')
          localStorage.setItem('username', data.user.email)
        }

        setSuccess(true)

        // Redirect after success
        setTimeout(() => {
          navigate('/')
        }, 3000)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Email verification failed')
      } finally {
        setLoading(false)
      }
    }

    verifyEmail()
  }, [token, navigate])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[var(--color-success-600)] to-[var(--color-success-800)] flex items-center justify-center p-4">
        <div className="text-center">
          <Loader className="w-12 h-12 text-white animate-spin mx-auto mb-4" />
          <p className="text-white text-lg">Verifying your email...</p>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[var(--color-success-600)] to-[var(--color-success-800)] flex items-center justify-center p-4">
        <div className="bg-[var(--color-bg-primary)] rounded-[var(--radius-xl)] shadow-xl p-8 max-w-md w-full text-center">
          <CheckCircle className="w-16 h-16 text-[var(--color-success-600)] mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-[var(--color-fg-primary)] mb-2">Email Verified!</h1>
          <p className="text-[var(--color-fg-tertiary)] mb-6">
            Your email has been successfully verified. You will be redirected shortly...
          </p>
          <button
            onClick={() => navigate('/')}
            className="w-full bg-[var(--color-success-600)] text-white py-2 rounded-[var(--radius-md)] font-medium hover:bg-[var(--color-success-700)] transition"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[var(--color-bg-secondary)] to-[var(--color-bg-tertiary)] flex items-center justify-center p-4">
        <div className="bg-[var(--color-bg-primary)] rounded-[var(--radius-xl)] shadow-lg p-8 max-w-md w-full mx-4">
          <AlertCircle className="w-12 h-12 text-[var(--color-error-600)] mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-[var(--color-fg-primary)] mb-2 text-center">Verification Error</h1>

          <div className="bg-[var(--color-error-50)] border border-[var(--color-error-200)] rounded-[var(--radius-md)] p-4 flex items-start gap-3 mb-6">
            <AlertCircle className="w-5 h-5 text-[var(--color-error-600)] flex-shrink-0 mt-0.5" />
            <p className="text-sm text-[var(--color-error-700)]">{error}</p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => navigate('/login')}
              className="w-full bg-[var(--color-brand-600)] text-white py-2 rounded-[var(--radius-md)] font-medium hover:bg-[var(--color-brand-700)] transition"
            >
              Back to Login
            </button>
            <button
              onClick={() => navigate('/resend-verification')}
              className="w-full bg-[var(--color-bg-tertiary)] text-[var(--color-fg-primary)] py-2 rounded-[var(--radius-md)] font-medium hover:bg-[var(--color-border-secondary)] transition"
            >
              Resend Verification Email
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}
