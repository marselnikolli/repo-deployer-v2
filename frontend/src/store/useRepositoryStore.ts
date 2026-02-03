import { create } from 'zustand'

interface Repository {
  id: number
  name: string
  url: string
  title: string
  category: string
  cloned: boolean
  deployed: boolean
  last_synced?: string
}

interface RepositoryStore {
  repositories: Repository[]
  selectedIds: Set<number>
  currentPage: number
  pageSize: number
  
  setRepositories: (repos: Repository[]) => void
  addRepository: (repo: Repository) => void
  updateRepository: (id: number, data: Partial<Repository>) => void
  deleteRepository: (id: number) => void
  
  toggleSelection: (id: number) => void
  selectAll: (repos: Repository[]) => void
  clearSelection: () => void
  isSelected: (id: number) => boolean
  getSelectedCount: () => number
  
  setCurrentPage: (page: number) => void
  setPageSize: (size: number) => void
}

export const useRepositoryStore = create<RepositoryStore>((set, get) => ({
  repositories: [],
  selectedIds: new Set(),
  currentPage: 1,
  pageSize: 20,
  
  setRepositories: (repos) => set({ repositories: repos }),
  addRepository: (repo) => set((state) => ({
    repositories: [repo, ...state.repositories]
  })),
  updateRepository: (id, data) => set((state) => ({
    repositories: state.repositories.map(r => r.id === id ? { ...r, ...data } : r)
  })),
  deleteRepository: (id) => set((state) => ({
    repositories: state.repositories.filter(r => r.id !== id)
  })),
  
  toggleSelection: (id) => set((state) => {
    const newSelected = new Set(state.selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    return { selectedIds: newSelected }
  }),
  
  selectAll: (repos) => set((state) => ({
    selectedIds: new Set(repos.map(r => r.id))
  })),
  
  clearSelection: () => set({ selectedIds: new Set() }),
  
  isSelected: (id) => get().selectedIds.has(id),
  
  getSelectedCount: () => get().selectedIds.size,
  
  setCurrentPage: (page) => set({ currentPage: page }),
  setPageSize: (size) => set({ pageSize: size }),
}))
