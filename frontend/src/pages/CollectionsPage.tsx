import { useState, useEffect } from 'react';
import { Button, Input, Label, Text, Heading } from 'react-aria-components';
import { Plus as PlusIcon, Trash2 as DeleteIcon, Archive as ArchiveIcon, Eye as EyeIcon } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { CollectionScanner } from '@/components/CollectionScanner';
import { DeleteConfirmationModal } from '@/components/DeleteConfirmationModal';

const apiClient = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  }
});

// Add authorization token to all requests
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

interface Collection {
  id: number;
  name: string;
  slug: string;
  description?: string;
  is_smart: boolean;
  is_public: boolean;
  is_template: boolean;
  auto_populate: boolean;
  created_at: string;
  updated_at: string;
}

interface CollectionDetail extends Collection {
  repositories: Repository[];
  repository_count: number;
}

interface Repository {
  id: number;
  name: string;
  url: string;
  description?: string;
  stars: number;
  language?: string;
  category: string;
}

export default function CollectionsPage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<CollectionDetail | null>(null);
  const [templates, setTemplates] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isTemplatesDialogOpen, setIsTemplatesDialogOpen] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{isOpen: boolean; title: string; message: string; itemCount: number; onConfirm: () => void}>({
    isOpen: false,
    title: '',
    message: '',
    itemCount: 0,
    onConfirm: () => {}
  });
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    is_smart: false,
    is_public: false,
    auto_populate: false,
    filter_config: {} as any
  });

  const [smartFilterConfig, setSmartFilterConfig] = useState({
    languages: [] as string[],
    categories: [] as string[],
    min_stars: 0,
    max_stars: 10000,
    search_text: ''
  });

  useEffect(() => {
    loadCollections();
    loadTemplates();
  }, []);

  const loadCollections = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/collections');
      setCollections(response.data);
    } catch (err: any) {
      console.error('Failed to load collections:', err);
      toast.error('Failed to load collections');
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const response = await apiClient.get('/collections/public-templates');
      setTemplates(response.data);
    } catch (err: any) {
      console.error('Failed to load templates:', err);
    }
  };

  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Collection name required');
      return;
    }

    try {
      const payload = {
        ...formData,
        filter_config: formData.is_smart ? smartFilterConfig : undefined
      };

      const response = await apiClient.post('/collections', payload);
      toast.success(`Collection "${response.data.name}" created`);
      
      setFormData({
        name: '',
        description: '',
        is_smart: false,
        is_public: false,
        auto_populate: false,
        filter_config: {}
      });
      setSmartFilterConfig({
        languages: [],
        categories: [],
        min_stars: 0,
        max_stars: 10000,
        search_text: ''
      });
      setIsCreateDialogOpen(false);
      await loadCollections();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to create collection');
    }
  };

  const handleViewCollection = async (collectionId: number) => {
    try {
      const response = await apiClient.get(`/collections/${collectionId}`);
      setSelectedCollection(response.data);
      setIsViewDialogOpen(true);
    } catch (err: any) {
      toast.error('Failed to load collection');
    }
  };

  const handleDeleteCollection = async (collectionId: number) => {
    setDeleteModal({
      isOpen: true,
      title: 'Delete Collection',
      message: 'Are you sure you want to delete this collection? This action cannot be undone.',
      itemCount: 1,
      onConfirm: async () => {
        try {
          await apiClient.delete(`/collections/${collectionId}`);
          toast.success('Collection deleted');
          await loadCollections();
          setDeleteModal(prev => ({...prev, isOpen: false}))
        } catch (err: any) {
          toast.error('Failed to delete collection');
        }
      }
    });
  };

  const handleRemoveRepository = async (collectionId: number, repoId: number) => {
    try {
      await apiClient.delete(`/collections/${collectionId}/repositories/${repoId}`);
      
      // Update local state
      if (selectedCollection) {
        setSelectedCollection({
          ...selectedCollection,
          repositories: selectedCollection.repositories.filter(r => r.id !== repoId),
          repository_count: selectedCollection.repository_count - 1
        });
      }
      toast.success('Repository removed');
    } catch (err: any) {
      toast.error('Failed to remove repository');
    }
  };

  const handleCreateFromTemplate = async (templateId: number) => {
    const name = prompt('Enter collection name:');
    if (!name) return;

    try {
      const response = await apiClient.post(`/collections/templates/${templateId}/create`, {
        name: name,
        description: `Based on template`
      });
      toast.success(`Collection "${response.data.name}" created from template`);
      setIsTemplatesDialogOpen(false);
      await loadCollections();
    } catch (err: any) {
      toast.error('Failed to create from template');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[var(--color-bg-primary)] to-[var(--color-bg-secondary)] p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Heading level={1} className="text-3xl font-bold text-[var(--color-fg-primary)] mb-2">
              Repository Collections
            </Heading>
            <Text className="text-[var(--color-fg-tertiary)]">Organize and group repositories into custom or smart collections</Text>
          </div>
          <div className="flex gap-3">
            <Button
              onPress={() => setIsTemplatesDialogOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 border border-[var(--color-border-primary)] text-[var(--color-fg-secondary)] rounded-lg hover:bg-[var(--color-bg-tertiary)] font-medium transition-colors"
            >
              <ArchiveIcon className="w-5 h-5" />
              Templates
            </Button>
            <Button
              onPress={() => setIsCreateDialogOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] text-[color:var(--color-fg-white)] rounded-lg font-medium transition-colors"
            >
              <PlusIcon className="w-5 h-5" />
              New Collection
            </Button>
          </div>
        </div>

        {/* Collections Grid */}
        {loading ? (
          <div className="text-center py-12">
            <Text className="text-[var(--color-fg-tertiary)]">Loading collections...</Text>
          </div>
        ) : collections.length === 0 ? (
          <div className="bg-[var(--color-bg-primary)] rounded-lg border border-[var(--color-border-secondary)] p-12 text-center">
            <ArchiveIcon className="w-12 h-12 text-[var(--color-fg-quaternary)] mx-auto mb-4" />
            <Text className="text-[var(--color-fg-tertiary)] mb-4">No collections yet</Text>
            <Button
              onPress={() => setIsCreateDialogOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] text-[color:var(--color-fg-white)] rounded-lg font-medium transition-colors"
            >
              <PlusIcon className="w-5 h-5" />
              Create First Collection
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {collections.map((collection) => (
              <div key={collection.id} className="bg-[var(--color-bg-primary)] rounded-lg border border-[var(--color-border-secondary)] p-6 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Heading level={3} className="text-lg font-bold text-[var(--color-fg-primary)]">
                        {collection.name}
                      </Heading>
                      {collection.is_public && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-[var(--color-blue-bg)] text-[var(--color-blue-text)] rounded">
                          Public
                        </span>
                      )}
                      {collection.is_smart && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-[var(--color-purple-bg)] text-[var(--color-purple-text)] rounded">
                          Smart
                        </span>
                      )}
                    </div>
                    {collection.description && (
                      <Text className="text-sm text-[var(--color-fg-tertiary)] mt-1">{collection.description}</Text>
                    )}
                  </div>
                </div>

                <div className="mb-4">
                  <div className="text-2xl font-bold text-[var(--color-fg-primary)] mb-1">
                    Collection
                  </div>
                  <Text className="text-sm text-[var(--color-fg-quaternary)]">
                    Created {new Date(collection.created_at).toLocaleDateString()}
                  </Text>
                </div>

                <div className="flex gap-2">
                  <Button
                    onPress={() => handleViewCollection(collection.id)}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 border border-[var(--color-border-primary)] text-[var(--color-fg-secondary)] rounded-lg hover:bg-[var(--color-bg-tertiary)] font-medium transition-colors text-sm"
                  >
                    <EyeIcon className="w-4 h-4" />
                    View
                  </Button>
                  <Button
                    onPress={() => handleDeleteCollection(collection.id)}
                    className="px-3 py-2 border border-[var(--color-error-300)] text-[var(--color-error-600)] rounded-lg hover:bg-[var(--color-error-50)] font-medium transition-colors text-sm"
                  >
                    <DeleteIcon className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Collection Dialog */}
      {isCreateDialogOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen p-4 bg-black/50">
            <div className="bg-[var(--color-bg-primary)] rounded-lg shadow-xl max-w-2xl w-full p-6 max-h-96 overflow-y-auto">
            <Heading level={2} className="text-2xl font-bold text-[var(--color-fg-primary)] mb-4">
              Create Collection
            </Heading>

            <form onSubmit={handleCreateCollection} className="space-y-4">
              <div>
                <Label className="block text-sm font-medium text-[var(--color-fg-secondary)] mb-1">Collection Name</Label>
                <Input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., My Favorite Tools"
                  className="w-full px-3 py-2 border border-[var(--color-border-primary)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)]"
                />
              </div>

              <div>
                <Label className="block text-sm font-medium text-[var(--color-fg-secondary)] mb-1">Description</Label>
                <Input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional description"
                  className="w-full px-3 py-2 border border-[var(--color-border-primary)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)]"
                />
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={formData.is_smart}
                  onChange={(e) => setFormData({ ...formData, is_smart: e.target.checked })}
                  className="rounded"
                  id="is_smart"
                />
                <Label htmlFor="is_smart" className="text-sm font-medium text-[var(--color-fg-secondary)] cursor-pointer">
                  Smart Collection (dynamic filtering)
                </Label>
              </div>

              {formData.is_smart && (
                <div className="border border-[var(--color-border-secondary)] rounded-lg p-4 space-y-3 bg-[var(--color-bg-secondary)]">
                  <div>
                    <Label className="block text-sm font-medium text-[var(--color-fg-secondary)] mb-1">Languages</Label>
                    <Input
                      type="text"
                      placeholder="e.g., Python, JavaScript (comma-separated)"
                      onChange={(e) => setSmartFilterConfig({
                        ...smartFilterConfig,
                        languages: e.target.value.split(',').map(s => s.trim()).filter(s => s)
                      })}
                      className="w-full px-3 py-2 border border-[var(--color-border-primary)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)]"
                    />
                  </div>

                  <div>
                    <Label className="block text-sm font-medium text-[var(--color-fg-secondary)] mb-1">Min Stars</Label>
                    <Input
                      type="number"
                      value={smartFilterConfig.min_stars}
                      onChange={(e) => setSmartFilterConfig({
                        ...smartFilterConfig,
                        min_stars: parseInt(e.target.value) || 0
                      })}
                      className="w-full px-3 py-2 border border-[var(--color-border-primary)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)]"
                    />
                  </div>

                  <div>
                    <Label className="block text-sm font-medium text-[var(--color-fg-secondary)] mb-1">Search Text</Label>
                    <Input
                      type="text"
                      value={smartFilterConfig.search_text}
                      onChange={(e) => setSmartFilterConfig({
                        ...smartFilterConfig,
                        search_text: e.target.value
                      })}
                      placeholder="Search in name/description"
                      className="w-full px-3 py-2 border border-[var(--color-border-primary)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)]"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={formData.is_public}
                  onChange={(e) => setFormData({ ...formData, is_public: e.target.checked })}
                  className="rounded"
                  id="is_public"
                />
                <Label htmlFor="is_public" className="text-sm font-medium text-[var(--color-fg-secondary)] cursor-pointer">
                  Make collection public
                </Label>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  onPress={() => setIsCreateDialogOpen(false)}
                  className="flex-1 px-4 py-2 border border-[var(--color-border-primary)] text-[var(--color-fg-secondary)] rounded-lg hover:bg-[var(--color-bg-tertiary)] font-medium transition-colors"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] text-[color:var(--color-fg-white)] rounded-lg font-medium transition-colors"
                >
                  Create Collection
                </Button>
              </div>
            </form>
          </div>
        </div>
        </div>
      )}

      {/* View Collection Dialog */}
      {isViewDialogOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen p-4 bg-black/50">
            <div className="bg-[var(--color-bg-primary)] rounded-lg shadow-xl max-w-4xl w-full p-6 max-h-[90vh] overflow-y-auto">
            {selectedCollection && (
              <>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <Heading level={2} className="text-2xl font-bold text-[var(--color-fg-primary)]">
                      {selectedCollection.name}
                    </Heading>
                    {selectedCollection.description && (
                      <Text className="text-[var(--color-fg-tertiary)]">{selectedCollection.description}</Text>
                    )}
                  </div>
                  <Button
                    onPress={() => setIsViewDialogOpen(false)}
                    className="text-[var(--color-fg-quaternary)] hover:text-[var(--color-fg-tertiary)]"
                  >
                    ×
                  </Button>
                </div>

                <div className="mb-4 p-3 bg-[var(--color-bg-secondary)] rounded-lg">
                  <div className="text-sm text-[var(--color-fg-tertiary)]">
                    <strong>{selectedCollection.repository_count}</strong> repositories
                    {selectedCollection.is_smart && ' (Smart collection)'}
                  </div>
                </div>

                {selectedCollection.repository_count > 0 && (
                  <div className="mb-6 border-t border-slate-200 pt-6">
                    <CollectionScanner
                      collectionId={selectedCollection.id}
                      collectionName={selectedCollection.name}
                    />
                  </div>
                )}

                {selectedCollection.repositories.length === 0 ? (
                  <Text className="text-[var(--color-fg-tertiary)] text-center py-8">No repositories in this collection</Text>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto border-t border-[var(--color-border-secondary)] pt-4">
                    <p className="text-sm font-semibold text-[var(--color-fg-secondary)] mb-3">Repositories in this collection:</p>
                    {selectedCollection.repositories.map((repo) => (
                      <div key={repo.id} className="flex items-center justify-between p-3 border border-[var(--color-border-secondary)] rounded-lg hover:bg-[var(--color-bg-tertiary)]">
                        <div className="flex-1">
                          <a href={repo.url} target="_blank" rel="noopener noreferrer" className="font-medium text-[var(--color-brand-600)] hover:text-[var(--color-brand-700)]">
                            {repo.name}
                          </a>
                          {repo.description && (
                            <Text className="text-sm text-[var(--color-fg-tertiary)]">{repo.description}</Text>
                          )}
                          <div className="flex gap-2 mt-1">
                            {repo.language && (
                              <span className="text-xs bg-[var(--color-bg-secondary)] text-[var(--color-fg-secondary)] px-2 py-0.5 rounded">
                                {repo.language}
                              </span>
                            )}
                            <span className="text-xs bg-[var(--color-bg-secondary)] text-[var(--color-fg-secondary)] px-2 py-0.5 rounded">
                              ⭐ {repo.stars}
                            </span>
                          </div>
                        </div>
                        <Button
                          onPress={() => handleRemoveRepository(selectedCollection.id, repo.id)}
                          className="ml-4 text-[var(--color-error-600)] hover:text-[var(--color-error-700)]"
                        >
                          <DeleteIcon className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-6 flex gap-3">
                  <Button
                    onPress={() => setIsViewDialogOpen(false)}
                    className="flex-1 px-4 py-2 border border-[var(--color-border-primary)] text-[var(--color-fg-secondary)] rounded-lg hover:bg-[var(--color-bg-tertiary)] font-medium transition-colors"
                  >
                    Close
                  </Button>
                </div>
              </>
            )}
            </div>
          </div>
        </div>
      )}

      {/* Templates Dialog */}
      {isTemplatesDialogOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen p-4 bg-black/50">
            <Heading level={2} className="text-2xl font-bold text-[var(--color-fg-primary)] mb-4">
              Collection Templates
            </Heading>

            {templates.length === 0 ? (
              <Text className="text-[var(--color-fg-tertiary)] text-center py-8">No templates available</Text>
            ) : (
              <div className="space-y-3">
                {templates.map((template) => (
                  <div key={template.id} className="flex items-center justify-between p-4 border border-[var(--color-border-secondary)] rounded-lg hover:bg-[var(--color-bg-tertiary)]">
                    <div className="flex-1">
                      <Heading level={3} className="font-medium text-[var(--color-fg-primary)]">
                        {template.name}
                      </Heading>
                      {template.description && (
                        <Text className="text-sm text-[var(--color-fg-tertiary)]">{template.description}</Text>
                      )}
                    </div>
                    <Button
                      onPress={() => handleCreateFromTemplate(template.id)}
                      className="ml-4 px-4 py-2 bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] text-[color:var(--color-fg-white)] rounded-lg font-medium transition-colors"
                    >
                      Use Template
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6">
              <Button
                onPress={() => setIsTemplatesDialogOpen(false)}
                className="w-full px-4 py-2 border border-[var(--color-border-primary)] text-[var(--color-fg-secondary)] rounded-lg hover:bg-[var(--color-bg-tertiary)] font-medium transition-colors"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={deleteModal.isOpen}
        title={deleteModal.title}
        message={deleteModal.message}
        itemCount={deleteModal.itemCount}
        onConfirm={deleteModal.onConfirm}
        onCancel={() => setDeleteModal(prev => ({...prev, isOpen: false}))}
      />
    </div>
  );
}
