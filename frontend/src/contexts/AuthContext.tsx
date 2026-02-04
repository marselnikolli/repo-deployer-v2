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
    const savedToken = localStorage.getItem('auth_token');
    const savedUsername = localStorage.getItem('username');

    if (savedToken && savedUsername) {
      setToken(savedToken);
      setUsername(savedUsername);
      setIsAuthenticated(true);
      
      // Verify token is still valid
      verifyToken(savedToken).catch(() => {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('username');
        setIsAuthenticated(false);
      });
    }

    setLoading(false);
  }, []);

  const verifyToken = async (tk: string) => {
    try {
      const result = await api.verify(tk);
      return result.valid;
    } catch {
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
