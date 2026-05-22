import { useState } from 'react';
import { Lock, Mail, User, AlertCircle, CheckCircle, Github, Chrome } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    password: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const validateForm = () => {
    if (!formData.email || !formData.password || !formData.confirmPassword) {
      setError('Please fill in all fields');
      return false;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long');
      return false;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setError('Please enter a valid email address');
      return false;
    }

    return true;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      setLoading(true);
      setError(undefined);

      const response = await axios.post('/api/auth/register', {
        email: formData.email,
        name: formData.name || formData.email.split('@')[0],
        password: formData.password,
      });

      // Store token in localStorage
      localStorage.setItem('auth_token', response.data.access_token);
      localStorage.setItem('auth_type', response.data.token_type);
      localStorage.setItem('username', formData.email);

      setSuccess(true);

      // Redirect after success
      setTimeout(() => {
        navigate('/');
        window.location.href = '/';
      }, 1500);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Registration failed. Please try again.';
      setError(errorMsg);
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
      setError('Failed to initiate GitHub registration');
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
      setError('Failed to initiate Google registration');
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[var(--color-success-600)] to-[var(--color-success-800)] flex items-center justify-center p-4">
        <div className="bg-[var(--color-bg-primary)] rounded-[var(--radius-xl)] shadow-xl p-8 max-w-md w-full text-center">
          <CheckCircle className="w-16 h-16 text-[var(--color-success-600)] mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-[var(--color-fg-primary)] mb-2">Account Created!</h2>
          <p className="text-[var(--color-fg-tertiary)] mb-2">Welcome, {formData.email}!</p>
          <p className="text-sm text-[var(--color-fg-quaternary)]">Redirecting to home...</p>
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
            <User className="w-8 h-8 text-[var(--color-brand-600)]" />
          </div>
          <h1 className="text-3xl font-bold text-[var(--color-fg-primary)]">Create Account</h1>
          <p className="text-[var(--color-fg-tertiary)] mt-2">Join Repo Deployer</p>
        </div>

        {/* Form */}
        <form onSubmit={handleRegister} className="space-y-4">
          {/* Error Alert */}
          {error && (
            <div className="bg-[var(--color-error-50)] border border-[var(--color-error-200)] rounded-[var(--radius-md)] p-3 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-[var(--color-error-600)] flex-shrink-0 mt-0.5" />
              <p className="text-[var(--color-error-700)] text-sm">{error}</p>
            </div>
          )}

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
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="you@example.com"
                disabled={loading}
                className="w-full pl-10 pr-4 py-2 border border-[var(--color-border-primary)] rounded-[var(--radius-md)] bg-[var(--color-bg-primary)] text-[var(--color-fg-primary)] placeholder:text-[var(--color-fg-placeholder)] focus:outline-none focus:border-[var(--color-brand-500)] disabled:bg-[var(--color-bg-disabled)]"
              />
            </div>
          </div>

          {/* Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-[var(--color-fg-secondary)] mb-1">
              Full Name (Optional)
            </label>
            <div className="relative">
              <User className="absolute left-3 top-3 w-5 h-5 text-[var(--color-fg-disabled)]" />
              <input
                id="name"
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="John Doe"
                disabled={loading}
                className="w-full pl-10 pr-4 py-2 border border-[var(--color-border-primary)] rounded-[var(--radius-md)] bg-[var(--color-bg-primary)] text-[var(--color-fg-primary)] placeholder:text-[var(--color-fg-placeholder)] focus:outline-none focus:border-[var(--color-brand-500)] disabled:bg-[var(--color-bg-disabled)]"
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
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="At least 8 characters"
                disabled={loading}
                className="w-full pl-10 pr-4 py-2 border border-[var(--color-border-primary)] rounded-[var(--radius-md)] bg-[var(--color-bg-primary)] text-[var(--color-fg-primary)] placeholder:text-[var(--color-fg-placeholder)] focus:outline-none focus:border-[var(--color-brand-500)] disabled:bg-[var(--color-bg-disabled)]"
              />
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-[var(--color-fg-secondary)] mb-1">
              Confirm Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 w-5 h-5 text-[var(--color-fg-disabled)]" />
              <input
                id="confirmPassword"
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="Re-enter your password"
                disabled={loading}
                className="w-full pl-10 pr-4 py-2 border border-[var(--color-border-primary)] rounded-[var(--radius-md)] bg-[var(--color-bg-primary)] text-[var(--color-fg-primary)] placeholder:text-[var(--color-fg-placeholder)] focus:outline-none focus:border-[var(--color-brand-500)] disabled:bg-[var(--color-bg-disabled)]"
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] disabled:opacity-50 text-white font-medium py-2 px-4 rounded-[var(--radius-md)] transition-colors duration-200 mt-6"
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        {/* OAuth Divider */}
        <div className="mt-8 relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[var(--color-border-secondary)]"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-[var(--color-bg-primary)] text-[var(--color-fg-quaternary)]">or sign up with</span>
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

        {/* Login Link */}
        <p className="text-center text-[var(--color-fg-tertiary)] mt-4">
          Already have an account?{' '}
          <button
            onClick={() => navigate('/login')}
            className="text-[var(--color-brand-600)] hover:text-[var(--color-brand-700)] font-medium"
          >
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}
