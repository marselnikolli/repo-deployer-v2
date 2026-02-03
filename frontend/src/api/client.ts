import axios from 'axios'

const API_BASE = '/api'

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  }
})

// Repository endpoints
export const repositoryApi = {
  list: (category?: string, skip = 0, limit = 100) =>
    api.get(`/repositories`, { params: { category, skip, limit } }),
  
  get: (id: number) =>
    api.get(`/repositories/${id}`),
  
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
}

// General endpoints
export const generalApi = {
  categories: () =>
    api.get('/categories'),
  
  stats: () =>
    api.get('/stats'),
  
  health: () =>
    api.get('/health'),
}

export default api
