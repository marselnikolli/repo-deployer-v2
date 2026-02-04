import { SearchResponse, Repository, AuthToken, User } from '../types';

const API_BASE = '/api';

export const api = {
  // Search
  search: async (
    q?: string,
    category?: string,
    cloned?: boolean,
    deployed?: boolean,
    limit = 100,
    offset = 0
  ): Promise<SearchResponse> => {
    const params = new URLSearchParams();
    if (q) params.append('q', q);
    if (category) params.append('category', category);
    if (cloned !== undefined) params.append('cloned', String(cloned));
    if (deployed !== undefined) params.append('deployed', String(deployed));
    params.append('limit', String(limit));
    params.append('offset', String(offset));

    const response = await fetch(`${API_BASE}/search?${params}`);
    if (!response.ok) throw new Error('Search failed');
    return response.json();
  },

  // Repositories
  getRepositories: async (
    category?: string,
    skip = 0,
    limit = 100
  ): Promise<Repository[]> => {
    const params = new URLSearchParams();
    if (category) params.append('category', category);
    params.append('skip', String(skip));
    params.append('limit', String(limit));

    const response = await fetch(`${API_BASE}/repositories?${params}`);
    if (!response.ok) throw new Error('Failed to fetch repositories');
    return response.json();
  },

  getRepository: async (id: number): Promise<Repository> => {
    const response = await fetch(`${API_BASE}/repositories/${id}`);
    if (!response.ok) throw new Error('Failed to fetch repository');
    return response.json();
  },

  // Auth
  login: async (username: string, password: string): Promise<AuthToken> => {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!response.ok) throw new Error('Login failed');
    return response.json();
  },

  verify: async (token: string): Promise<User> => {
    const response = await fetch(`${API_BASE}/auth/verify`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error('Token verification failed');
    return response.json();
  },

  // Stats
  getStats: async () => {
    const response = await fetch(`${API_BASE}/stats`);
    if (!response.ok) throw new Error('Failed to fetch stats');
    return response.json();
  },

  // Health
  health: async () => {
    const response = await fetch(`${API_BASE}/health`);
    if (!response.ok) throw new Error('Health check failed');
    return response.json();
  },
};
