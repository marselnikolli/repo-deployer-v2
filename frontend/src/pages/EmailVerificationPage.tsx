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
        const response = await fetch('http://localhost:8000/api/auth/email-verify', {
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
      <div className="min-h-screen bg-gradient-to-br from-green-600 to-green-800 flex items-center justify-center p-4">
        <div className="text-center">
          <Loader className="w-12 h-12 text-white animate-spin mx-auto mb-4" />
          <p className="text-white text-lg">Verifying your email...</p>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-600 to-green-800 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full text-center">
          <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Email Verified!</h1>
          <p className="text-gray-600 mb-6">
            Your email has been successfully verified. You will be redirected shortly...
          </p>
          <button
            onClick={() => navigate('/')}
            className="w-full bg-green-600 text-white py-2 rounded-lg font-medium hover:bg-green-700 transition"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full mx-4">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">Verification Error</h1>

          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3 mb-6">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => navigate('/login')}
              className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 transition"
            >
              Back to Login
            </button>
            <button
              onClick={() => navigate('/resend-verification')}
              className="w-full bg-gray-200 text-gray-900 py-2 rounded-lg font-medium hover:bg-gray-300 transition"
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
