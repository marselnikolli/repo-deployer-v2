import { useState } from 'react'
import { Mail, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

export default function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string>()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email) {
      setError('Please enter your email address')
      return
    }

    try {
      setLoading(true)
      setError(undefined)

      const response = await fetch('/api/auth/password-reset-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.detail || 'Failed to send reset email')
      }

      setSuccess(true)
      toast.success('Password reset email sent!')

      setTimeout(() => {
        navigate('/login')
      }, 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email')
      toast.error(err instanceof Error ? err.message : 'Failed to send reset email')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[var(--color-brand-600)] to-[var(--color-brand-800)] flex items-center justify-center p-4">
        <div className="bg-[var(--color-bg-primary)] rounded-[var(--radius-xl)] shadow-xl p-8 max-w-md w-full text-center">
          <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-[var(--color-fg-primary)] mb-2">Check Your Email</h2>
          <p className="text-[var(--color-fg-tertiary)] mb-6">
            A password reset link has been sent to <strong>{email}</strong>. Please check your inbox and click the link to reset your password.
          </p>
          <p className="text-sm text-[var(--color-fg-quaternary)] mb-6">The link will expire in 24 hours.</p>
          <button
            onClick={() => navigate('/login')}
            className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 transition"
          >
            Back to Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[var(--color-brand-600)] to-[var(--color-brand-800)] flex items-center justify-center p-4">
      <div className="bg-[var(--color-bg-primary)] rounded-[var(--radius-xl)] shadow-xl p-8 max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-block bg-[var(--color-brand-50)] p-3 rounded-full mb-4">
            <Mail className="w-8 h-8 text-[var(--color-brand-600)]" />
          </div>
          <h1 className="text-3xl font-bold text-[var(--color-fg-primary)]">Forgot Password?</h1>
          <p className="text-[var(--color-fg-tertiary)] mt-2">Enter your email to reset your password</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-[var(--color-fg-secondary)] mb-1">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={loading}
              className="w-full px-4 py-2 border border-[var(--color-border-primary)] rounded-[var(--radius-md)] bg-[var(--color-bg-primary)] text-[var(--color-fg-primary)] placeholder:text-[var(--color-fg-placeholder)] focus:outline-none focus:border-[var(--color-brand-500)] disabled:bg-[var(--color-bg-disabled)]"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-[var(--color-error-50)] border border-[var(--color-error-200)] rounded-[var(--radius-md)] p-3 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-[var(--color-error-600)] flex-shrink-0 mt-0.5" />
              <p className="text-sm text-[var(--color-error-700)]">{error}</p>
            </div>
          )}

          {/* Info Message */}
          <div className="bg-[var(--color-brand-50)] border border-[var(--color-brand-200)] rounded-[var(--radius-md)] p-3">
            <p className="text-sm text-[var(--color-brand-700)]">
              We'll send you an email with a link to reset your password. The link will expire in 24 hours.
            </p>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[var(--color-brand-600)] text-white py-2 rounded-[var(--radius-md)] font-medium hover:bg-[var(--color-brand-700)] disabled:opacity-50 transition mt-6"
          >
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>

        {/* Back to Login */}
        <div className="mt-6 text-center">
          <button
            onClick={() => navigate('/login')}
            className="inline-flex items-center gap-2 text-[var(--color-brand-600)] hover:text-[var(--color-brand-700)] font-medium transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Login
          </button>
        </div>
      </div>
    </div>
  )
}
