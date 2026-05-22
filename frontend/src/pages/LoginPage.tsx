import { useState } from 'react';
import { Lock, Mail, AlertCircle, Github, Chrome } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface LoginPageProps {
  onLoginSuccess?: () => void;
}

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const navigate = useNavigate();
  const { login } = useAuth();
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

      // Use AuthContext's login method instead of direct API call
      await login(email, password);
      
      setSuccess(true);
      
      // Redirect after success
      setTimeout(() => {
        onLoginSuccess?.();
        navigate('/');
      }, 500);
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
      // Generate CSRF protection state parameter
      const state = Math.random().toString(36).substring(2, 15) + 
                   Math.random().toString(36).substring(2, 15);
      sessionStorage.setItem('github_oauth_state', state);
      
      const response = await fetch('/api/auth/oauth/github/authorize');
      const data = await response.json();
      
      // Add state parameter to authorization URL
      const url = new URL(data.authorization_url);
      url.searchParams.set('state', state);
      
      window.location.href = url.toString();
    } catch (err) {
      setError('Failed to initiate GitHub login');
    }
  };

  const handleGoogleLogin = async () => {
    try {
      // Generate CSRF protection state parameter
      const state = Math.random().toString(36).substring(2, 15) + 
                   Math.random().toString(36).substring(2, 15);
      sessionStorage.setItem('google_oauth_state', state);
      
      const response = await fetch('/api/auth/oauth/google/authorize');
      const data = await response.json();
      
      // Add state parameter to authorization URL
      const url = new URL(data.authorization_url);
      url.searchParams.set('state', state);
      
      window.location.href = url.toString();
    } catch (err) {
      setError('Failed to initiate Google login');
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[var(--color-brand-600)] to-[var(--color-brand-800)] flex items-center justify-center p-4">
        <div className="bg-[var(--color-bg-primary)] rounded-[var(--radius-xl)] shadow-xl p-8 max-w-md w-full text-center">
          <div className="text-[var(--color-success-600)] text-4xl mb-4">✓</div>
          <h2 className="text-2xl font-bold text-[var(--color-fg-primary)] mb-2">Login Successful!</h2>
          <p className="text-[var(--color-fg-tertiary)]">Welcome back!</p>
          <p className="text-sm text-[var(--color-fg-quaternary)] mt-2">Redirecting...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[var(--color-brand-600)] to-[var(--color-brand-800)] flex items-center justify-center p-4">
      <div className="bg-[var(--color-bg-primary)] rounded-[var(--radius-xl)] shadow-xl p-8 max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-block bg-[var(--color-brand-50)] p-3 rounded-full mb-4">
            <Lock className="w-8 h-8 text-[var(--color-brand-600)]" />
          </div>
          <h1 className="text-3xl font-bold text-[var(--color-fg-primary)]">Repo Deployer</h1>
          <p className="text-[var(--color-fg-tertiary)] mt-2">Sign in to your account</p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-[var(--color-fg-secondary)] mb-1">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 w-5 h-5 text-[var(--color-fg-disabled)]" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={loading}
                className="w-full pl-10 pr-4 py-2 border border-[var(--color-border-primary)] rounded-[var(--radius-md)] bg-[var(--color-bg-primary)] text-[var(--color-fg-primary)] placeholder:text-[var(--color-fg-placeholder)] focus:outline-none focus:border-[var(--color-brand-500)] disabled:bg-[var(--color-bg-disabled)] disabled:text-[var(--color-fg-disabled)]"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-[var(--color-fg-secondary)] mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 w-5 h-5 text-[var(--color-fg-disabled)]" />
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                disabled={loading}
                className="w-full pl-10 pr-4 py-2 border border-[var(--color-border-primary)] rounded-[var(--radius-md)] bg-[var(--color-bg-primary)] text-[var(--color-fg-primary)] placeholder:text-[var(--color-fg-placeholder)] focus:outline-none focus:border-[var(--color-brand-500)] disabled:bg-[var(--color-bg-disabled)] disabled:text-[var(--color-fg-disabled)]"
              />
            </div>
            <div className="text-right mt-2">
              <button
                type="button"
                onClick={() => navigate('/forgot-password')}
                className="text-sm text-[var(--color-brand-600)] hover:text-[var(--color-brand-700)] font-medium"
              >
                Forgot Password?
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-[var(--color-error-50)] border border-[var(--color-error-200)] rounded-[var(--radius-md)] p-3 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-[var(--color-error-600)] flex-shrink-0 mt-0.5" />
              <p className="text-sm text-[var(--color-error-700)]">{error}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[var(--color-brand-600)] text-white py-2 rounded-[var(--radius-md)] font-medium hover:bg-[var(--color-brand-700)] disabled:bg-[var(--color-fg-disabled)] transition mt-6"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        {/* OAuth Divider */}
        <div className="mt-8 relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[var(--color-border-secondary)]"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-[var(--color-bg-primary)] text-[var(--color-fg-quaternary)]">or continue with</span>
          </div>
        </div>

        {/* OAuth Buttons */}
        <div className="mt-6 space-y-3">
          <button
            onClick={handleGitHubLogin}
            disabled={loading}
            className="w-full bg-gray-900 text-white py-2 rounded-[var(--radius-md)] font-medium hover:bg-gray-800 disabled:opacity-50 transition flex items-center justify-center gap-2"
          >
            <Github className="w-5 h-5" />
            GitHub
          </button>
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full bg-[var(--color-bg-primary)] text-[var(--color-fg-primary)] border border-[var(--color-border-primary)] py-2 rounded-[var(--radius-md)] font-medium hover:bg-[var(--color-bg-secondary)] disabled:opacity-50 transition flex items-center justify-center gap-2"
          >
            <Chrome className="w-5 h-5 text-[var(--color-error-500)]" />
            Google
          </button>
        </div>

        {/* Register Link */}
        <div className="mt-6 text-center text-sm text-[var(--color-fg-tertiary)]">
          Don't have an account?{' '}
          <button
            onClick={() => navigate('/register')}
            className="text-[var(--color-brand-600)] hover:text-[var(--color-brand-700)] font-medium transition"
          >
            Sign up here
          </button>
        </div>

        {/* Demo Credentials — only shown in development builds */}
        {import.meta.env.DEV && (
          <div className="mt-6 pt-6 border-t border-[var(--color-border-secondary)]">
            <p className="text-xs text-[var(--color-fg-tertiary)] text-center mb-3">Demo Credentials:</p>
            <div className="bg-[var(--color-bg-secondary)] rounded-[var(--radius-md)] p-3 text-xs text-[var(--color-fg-tertiary)] space-y-1">
              <p><span className="font-medium">Username:</span> any username</p>
              <p><span className="font-medium">Password:</span> any password</p>
              <p className="text-[var(--color-fg-quaternary)] italic mt-2">(Mock authentication for demonstration)</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
