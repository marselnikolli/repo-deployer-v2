export interface Repository {
  id: number;
  name: string;
  title: string;
  url: string;
  category?: string;
  cloned: boolean;
  deployed: boolean;
  created_at?: string;
}

export interface SearchResponse {
  results: Repository[];
  total: number;
  limit: number;
  offset: number;
}

export interface AuthToken {
  access_token: string;
  token_type: string;
}

export interface User {
  username: string;
  valid: boolean;
}

export interface AuditLog {
  id: number;
  operation: string;
  resource_type: string;
  resource_id: number;
  status: string;
  timestamp: string;
  details: string;
  error_message?: string;
}

export interface Stats {
  total_repositories: number;
  total_cloned: number;
  total_deployed: number;
  categories: Record<string, number>;
}
