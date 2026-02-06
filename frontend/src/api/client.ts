import axios from 'axios'

const API_BASE = '/api'

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  }
})

// Add authorization interceptor
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Repository endpoints
export const repositoryApi = {
  list: (category?: string, skip = 0, limit = 100, sortBy?: string, sortOrder?: 'asc' | 'desc') =>
    api.get(`/repositories`, { params: { category, skip, limit, sort_by: sortBy, sort_order: sortOrder } }),

  get: (id: number) =>
    api.get(`/repositories/${id}`),

  create: (data: any) =>
    api.post(`/repositories`, data),

  update: (id: number, data: any) =>
    api.put(`/repositories/${id}`, data),

  delete: (id: number) =>
    api.delete(`/repositories/${id}`),

  clone: (id: number) =>
    api.post(`/repositories/${id}/clone`),

  sync: (id: number) =>
    api.post(`/repositories/${id}/sync`),

  deploy: (id: number) =>
    api.post(`/repositories/${id}/deploy`),

  checkDuplicate: (url: string) =>
    api.get(`/repositories/check-duplicate`, { params: { url } }),

  syncMetadata: (id: number) =>
    api.post(`/repositories/${id}/sync-metadata`),

  checkHealth: (id: number) =>
    api.post(`/repositories/${id}/check-health`),
}

// GitHub metadata endpoints
export const githubApi = {
  fetchMetadata: (url: string) =>
    api.get('/github/metadata', { params: { url } }),
}

// Tags endpoints
export const tagsApi = {
  list: () =>
    api.get('/tags'),

  create: (name: string, color: string = '#6B7280') =>
    api.post('/tags', { name, color }),

  delete: (id: number) =>
    api.delete(`/tags/${id}`),

  addToRepo: (repoId: number, tagIds: number[]) =>
    api.post(`/repositories/${repoId}/tags`, tagIds),

  removeFromRepo: (repoId: number, tagIds: number[]) =>
    api.delete(`/repositories/${repoId}/tags`, { data: tagIds }),
}

// Search endpoint
export const searchApi = {
  search: (q?: string, category?: string, cloned?: boolean, deployed?: boolean, limit = 100, offset = 0) =>
    api.get('/search', { params: { q, category, cloned, deployed, limit, offset } }),
}

// Import endpoints
export const importApi = {
  htmlFile: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/import/html', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  
  folder: (folderPath: string) =>
    api.post('/import/folder', null, { params: { folder_path: folderPath } }),
}

// Bulk operations
export const bulkApi = {
  updateCategory: (ids: number[], category: string) =>
    api.post('/bulk/update-category', { repository_ids: ids, new_category: category }),
  
  delete: (ids: number[]) =>
    api.post('/bulk/delete', { repository_ids: ids }),
  
  healthCheck: (ids: number[]) =>
    api.post('/bulk/health-check', { repository_ids: ids }),
}

// General endpoints
export const generalApi = {
  categories: () =>
    api.get('/categories'),

  stats: () =>
    api.get('/stats'),

  health: () =>
    api.get('/health'),
  
  importJobs: () =>
    api.get('/imports/jobs'),

  getHealthCheckProgress: (jobId: string) =>
    api.get(`/bulk/health-check/${jobId}/progress`),
}

// Export endpoints
export const exportApi = {
  csv: (category?: string) =>
    `${API_BASE}/export/csv${category ? `?category=${category}` : ''}`,

  json: (category?: string) =>
    `${API_BASE}/export/json${category ? `?category=${category}` : ''}`,

  markdown: (category?: string) =>
    `${API_BASE}/export/markdown${category ? `?category=${category}` : ''}`,
}

// Clone queue endpoints
export const cloneQueueApi = {
  status: () =>
    api.get('/clone-queue/status'),

  jobs: () =>
    api.get('/clone-queue/jobs'),

  add: (repositoryIds: number[]) =>
    api.post('/clone-queue/add', repositoryIds),

  cancel: (jobId: number) =>
    api.post(`/clone-queue/cancel/${jobId}`),

  clear: () =>
    api.post('/clone-queue/clear'),
}

export default api
