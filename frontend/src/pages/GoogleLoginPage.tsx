import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader, AlertCircle, CheckCircle } from 'lucide-react';

export default function GoogleLoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const processedRef = useRef(false);

  useEffect(() => {
    // Prevent double execution
    if (processedRef.current) return;
    
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    const handleGoogleCallback = async () => {
      try {
        // Handle OAuth errors
        if (error) {
          setError(`Authentication failed: ${error} - ${errorDescription || 'Unknown error'}`);
          setLoading(false);
          return;
        }

        if (!code) {
          setError('No authorization code received from Google');
          setLoading(false);
          return;
        }

        console.log('Google callback - Code:', code?.substring(0, 20) + '...' || 'None', 'State:', state);

        // Clear stored state from sessionStorage
        sessionStorage.removeItem('google_oauth_state');

        // Exchange code for JWT token (pass state to backend for validation)
        const response = await fetch('/api/auth/oauth/google/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, state })
        });

        console.log('Backend callback response status:', response.status);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error('Backend error response:', errorData);
          throw new Error(errorData.detail || `Failed to authenticate with Google (${response.status})`);
        }

        const data = await response.json();
        console.log('Token response:', data);
        
        // Save token and user info
        localStorage.setItem('auth_token', data.access_token);
        localStorage.setItem('auth_type', 'Bearer');
        localStorage.setItem('username', data.user.email);
        
        console.log('Token saved to localStorage:', {
          token: data.access_token?.substring(0, 20),
          email: data.user.email
        });
        
        setSuccess(true);
        setLoading(false);

        // Redirect to home after success animation with hard reload
        setTimeout(() => {
          navigate('/');
          window.location.href = '/';
        }, 1500);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Authentication failed');
        setLoading(false);
      }
    };

    if (code) {
      processedRef.current = true;
      handleGoogleCallback();
    } else {
      setLoading(false);
    }
  }, [searchParams, navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center">
          <Loader className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-[var(--color-fg-tertiary)]">Connecting with Google...</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center">
          <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome!</h2>
          <p className="text-[var(--color-fg-tertiary)]">You're logged in. Redirecting...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full mx-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Authentication Error</h1>
        
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3 mb-6">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <button
          onClick={() => navigate('/login')}
          className="w-full bg-[var(--color-brand-600)] text-[color:var(--color-fg-white)] py-2 rounded-lg font-medium hover:bg-[var(--color-brand-700)] transition"
        >
          Back to Login
        </button>
      </div>
    </div>
  );
}
