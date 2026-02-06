import { useState } from 'react';
import { Lock, Mail, AlertCircle, Github, Chrome } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

interface LoginPageProps {
  onLoginSuccess?: () => void;
}

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }

    try {
      setLoading(true);
      setError(undefined);

      const response = await api.login(email, password);
      
      // Store token in localStorage
      localStorage.setItem('auth_token', response.access_token);
      localStorage.setItem('auth_type', response.token_type);
      localStorage.setItem('username', email);
      
      setSuccess(true);
      
      // Redirect after success
      setTimeout(() => {
        onLoginSuccess?.();
        window.location.href = '/';
      }, 1500);
    } catch (err) {
      setError(
        err instanceof Error 
          ? err.message 
          : 'Login failed. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGitHubLogin = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/auth/oauth/github/authorize');
      const data = await response.json();
      window.location.href = data.authorization_url;
    } catch (err) {
      setError('Failed to initiate GitHub login');
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/auth/oauth/google/authorize');
      const data = await response.json();
      window.location.href = data.authorization_url;
    } catch (err) {
      setError('Failed to initiate Google login');
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full text-center">
          <div className="text-green-600 text-4xl mb-4">✓</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Login Successful!</h2>
          <p className="text-gray-600">Welcome back!</p>
          <p className="text-sm text-gray-500 mt-2">Redirecting...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-block bg-blue-100 p-3 rounded-full mb-4">
            <Lock className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Repo Deployer</h1>
          <p className="text-gray-600 mt-2">Sign in to your account</p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={loading}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 text-gray-900"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                disabled={loading}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 text-gray-900"
              />
            </div>
          </div>

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
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        {/* OAuth Divider */}
        <div className="mt-8 relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">or continue with</span>
          </div>
        </div>

        {/* OAuth Buttons */}
        <div className="mt-6 space-y-3">
          <button
            onClick={handleGitHubLogin}
            disabled={loading}
            className="w-full bg-gray-900 text-white py-2 rounded-lg font-medium hover:bg-gray-800 disabled:bg-gray-400 transition flex items-center justify-center gap-2"
          >
            <Github className="w-5 h-5" />
            GitHub
          </button>
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full bg-white text-gray-900 border border-gray-300 py-2 rounded-lg font-medium hover:bg-gray-50 disabled:bg-gray-100 transition flex items-center justify-center gap-2"
          >
            <Chrome className="w-5 h-5 text-red-500" />
            Google
          </button>
        </div>

        {/* Register Link */}
        <div className="mt-6 text-center text-sm text-gray-600">
          Don't have an account?{' '}
          <button
            onClick={() => navigate('/register')}
            className="text-blue-600 hover:text-blue-700 font-medium transition"
          >
            Sign up here
          </button>
        </div>

        {/* Demo Credentials */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <p className="text-xs text-gray-600 text-center mb-3">Demo Credentials:</p>
          <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1">
            <p>
              <span className="font-medium">Username:</span> any username
            </p>
            <p>
              <span className="font-medium">Password:</span> any password
            </p>
            <p className="text-gray-500 italic mt-2">
              (Mock authentication for demonstration)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
