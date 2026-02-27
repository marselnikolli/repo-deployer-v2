import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../services/api';

interface AuthContextType {
  isAuthenticated: boolean;
  username: string | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Check for existing token on mount
  useEffect(() => {
    const initializeAuth = async () => {
      const savedToken = localStorage.getItem('auth_token');
      const savedUsername = localStorage.getItem('username');

      if (savedToken && savedUsername) {
        setToken(savedToken);
        setUsername(savedUsername);
        
        // Verify token is still valid before setting authenticated
        const valid = await verifyToken(savedToken);
        if (valid) {
          setIsAuthenticated(true);
        } else {
          // Token is invalid, clear it
          localStorage.removeItem('auth_token');
          localStorage.removeItem('username');
          setIsAuthenticated(false);
          setToken(null);
          setUsername(null);
        }
      }

      setLoading(false);
    };

    initializeAuth();
  }, []);

  // Listen for storage changes (e.g., logout from another tab)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'auth_token') {
        if (e.newValue) {
          const savedUsername = localStorage.getItem('username');
          setToken(e.newValue);
          setUsername(savedUsername);
          setIsAuthenticated(true);
        } else {
          setToken(null);
          setUsername(null);
          setIsAuthenticated(false);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const verifyToken = async (tk: string) => {
    try {
      // If verify() succeeds, token is valid
      await api.verify(tk);
      return true;
    } catch {
      // If verify() fails (401 or other error), token is invalid
      return false;
    }
  };

  const login = async (user: string, pass: string) => {
    try {
      setLoading(true);
      const response = await api.login(user, pass);
      
      setToken(response.access_token);
      setUsername(user);
      setIsAuthenticated(true);
      
      localStorage.setItem('auth_token', response.access_token);
      localStorage.setItem('auth_type', response.token_type);
      localStorage.setItem('username', user);
    } catch (error) {
      setIsAuthenticated(false);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setToken(null);
    setUsername(null);
    setIsAuthenticated(false);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_type');
    localStorage.removeItem('username');
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, username, token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
