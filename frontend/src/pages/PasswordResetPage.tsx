import { useState } from 'react'
import { Lock, CheckCircle, AlertCircle } from 'lucide-react'
import { useSearchParams, useNavigate } from 'react-router-dom'

export default function PasswordResetPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [success, setSuccess] = useState(false)
  const [validationError, setValidationError] = useState<string>()

  const token = searchParams.get('token')

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-4 text-center">Invalid Link</h1>
          <p className="text-gray-600 mb-6">The password reset link is invalid or has expired.</p>
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    setValidationError(undefined)
    setError(undefined)

    // Validation
    if (!password || !confirmPassword) {
      setValidationError('Please enter both password fields')
      return
    }

    if (password.length < 8) {
      setValidationError('Password must be at least 8 characters long')
      return
    }

    if (password !== confirmPassword) {
      setValidationError('Passwords do not match')
      return
    }

    try {
      setLoading(true)

      const response = await fetch('http://localhost:8000/api/auth/password-reset-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          new_password: password,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.detail || 'Password reset failed')
      }

      const data = await response.json()

      // Save token
      localStorage.setItem('auth_token', data.access_token)
      localStorage.setItem('auth_type', 'Bearer')
      localStorage.setItem('username', data.user.email)

      setSuccess(true)

      // Redirect after success
      setTimeout(() => {
        navigate('/')
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full text-center">
          <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Password Reset Successful!</h2>
          <p className="text-gray-600 mb-6">Your password has been reset. You will be redirected shortly...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-block bg-blue-100 p-3 rounded-full mb-4">
            <Lock className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Reset Password</h1>
          <p className="text-gray-600 mt-2">Enter your new password below</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* New Password */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              New Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              disabled={loading}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 text-gray-900"
            />
          </div>

          {/* Confirm Password */}
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat password"
              disabled={loading}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 text-gray-900"
            />
          </div>

          {/* Validation Error */}
          {validationError && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-yellow-800">{validationError}</p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 transition mt-6"
          >
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>

        {/* Back to Login */}
        <div className="mt-6 text-center text-sm text-gray-600">
          Remember your password?{' '}
          <button
            onClick={() => navigate('/login')}
            className="text-blue-600 hover:text-blue-700 font-medium transition"
          >
            Back to login
          </button>
        </div>
      </div>
    </div>
  )
}
