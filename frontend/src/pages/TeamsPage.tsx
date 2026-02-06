import { useState, useEffect } from 'react';
import { Button, Input, Label, Text, Heading } from 'react-aria-components';
import { Trash2 as TrashIcon, Plus as PlusIcon, Users as UsersIcon } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';

const apiClient = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  }
});

interface TeamMember {
  id: number;
  user_id: number;
  role: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  joined_at: string;
}

interface Team {
  id: number;
  name: string;
  slug: string;
  description?: string;
  owner_id: number;
  logo_url?: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

interface CreateTeamForm {
  name: string;
  slug: string;
  description: string;
}

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isMembersDialogOpen, setIsMembersDialogOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [formData, setFormData] = useState<CreateTeamForm>({
    name: '',
    slug: '',
    description: ''
  });

  useEffect(() => {
    loadTeams();
  }, []);

  const loadTeams = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/teams');
      setTeams(response.data);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load teams:', err);
      setError(err.response?.data?.detail || 'Failed to load teams');
    } finally {
      setLoading(false);
    }
  };

  const loadTeamMembers = async (teamId: number) => {
    try {
      setMembersLoading(true);
      const response = await apiClient.get(`/teams/${teamId}/members`);
      setTeamMembers(response.data);
    } catch (err: any) {
      console.error('Failed to load team members:', err);
      toast.error('Failed to load team members');
    } finally {
      setMembersLoading(false);
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.slug) {
      toast.error('Team name and slug are required');
      return;
    }

    try {
      await apiClient.post('/teams', {
        name: formData.name,
        slug: formData.slug,
        description: formData.description || undefined
      });
      toast.success('Team created successfully');
      setFormData({ name: '', slug: '', description: '' });
      setIsCreateDialogOpen(false);
      await loadTeams();
    } catch (err: any) {
      console.error('Failed to create team:', err);
      toast.error(err.response?.data?.detail || 'Failed to create team');
    }
  };

  const handleDeleteTeam = async (teamId: number) => {
    if (!window.confirm('Are you sure you want to delete this team? This action cannot be undone.')) {
      return;
    }

    try {
      await apiClient.delete(`/teams/${teamId}`);
      toast.success('Team deleted successfully');
      await loadTeams();
    } catch (err: any) {
      console.error('Failed to delete team:', err);
      toast.error(err.response?.data?.detail || 'Failed to delete team');
    }
  };

  const handleShowMembers = async (team: Team) => {
    setSelectedTeam(team);
    setIsMembersDialogOpen(true);
    await loadTeamMembers(team.id);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--color-brand-500)]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-[#0f172a] dark:to-[#1e293b] p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Heading level={1} className="text-3xl font-bold text-[var(--color-fg-primary)] mb-2">
              Teams
            </Heading>
            <Text className="text-[var(--color-fg-tertiary)]">Manage your teams and collaborate with others</Text>
          </div>
          <Button
            onPress={() => setIsCreateDialogOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] text-white rounded-lg font-medium transition-colors"
          >
            <PlusIcon className="w-5 h-5" />
            New Team
          </Button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
            <Text className="text-red-800 dark:text-red-200">{error}</Text>
          </div>
        )}

        {/* Teams Grid */}
        {teams.length === 0 ? (
          <div className="text-center py-12 bg-[var(--color-bg-primary)] rounded-lg border border-[var(--color-border-primary)]">
            <UsersIcon className="w-12 h-12 mx-auto text-[var(--color-fg-quaternary)] mb-4" />
            <Heading level={3} className="text-lg font-semibold text-[var(--color-fg-primary)] mb-2">
              No teams yet
            </Heading>
            <Text className="text-[var(--color-fg-tertiary)] mb-6">Create your first team to get started collaborating</Text>
            <Button
              onPress={() => setIsCreateDialogOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] text-[color:var(--color-fg-white)] rounded-lg font-medium transition-colors"
            >
              <PlusIcon className="w-5 h-5" />
              Create Team
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {teams.map((team) => (
              <div
                key={team.id}
                className="bg-[var(--color-bg-primary)] rounded-lg border border-[var(--color-border-primary)] hover:border-[var(--color-border-secondary)] hover:shadow-md dark:shadow-lg transition-all p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <Heading level={3} className="text-lg font-semibold text-[var(--color-fg-primary)] mb-1">
                      {team.name}
                    </Heading>
                    <Text className="text-sm text-[var(--color-fg-quaternary)] mb-2">@{team.slug}</Text>
                    {team.description && (
                      <Text className="text-[var(--color-fg-tertiary)] text-sm mb-4">{team.description}</Text>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {team.is_public ? (
                      <span className="inline-block px-2 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">
                        Public
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-1 text-xs font-medium bg-[var(--color-bg-secondary)] text-[var(--color-fg-secondary)] rounded">
                        Private
                      </span>
                    )}
                  </div>
                </div>

                <div className="border-t border-[var(--color-border-primary)] pt-4 flex gap-3">
                  <Button
                    onPress={() => handleShowMembers(team)}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 bg-[var(--color-bg-secondary)] hover:bg-[var(--color-border-primary)] text-[var(--color-fg-secondary)] rounded-lg font-medium transition-colors text-sm"
                  >
                    <UsersIcon className="w-4 h-4" />
                    Members
                  </Button>
                  <Button
                    onPress={() => handleDeleteTeam(team.id)}
                    className="inline-flex items-center justify-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-950 hover:bg-red-100 dark:hover:bg-red-900 text-red-700 dark:text-red-400 rounded-lg font-medium transition-colors"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Team Dialog */}
      {isCreateDialogOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen p-4 bg-black/50">
            <div className="bg-[var(--color-bg-primary)] rounded-lg shadow-xl dark:shadow-2xl max-w-md w-full p-6">
              <Heading level={2} className="text-2xl font-bold text-[var(--color-fg-primary)] mb-4">
                Create New Team
              </Heading>

              <form onSubmit={handleCreateTeam} className="space-y-4">
                <div>
                  <Label className="block text-sm font-medium text-[var(--color-fg-primary)] mb-1">Team Name *</Label>
                  <Input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., My Development Team"
                    className="w-full px-3 py-2 border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-[var(--color-fg-primary)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)]"
                  />
                </div>

                <div>
                  <Label className="block text-sm font-medium text-[var(--color-fg-primary)] mb-1">Team Slug *</Label>
                  <Input
                    type="text"
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                    placeholder="e.g., my-dev-team"
                    className="w-full px-3 py-2 border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-[var(--color-fg-primary)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)]"
                  />
                </div>

                <div>
                  <Label className="block text-sm font-medium text-[var(--color-fg-primary)] mb-1">Description</Label>
                  <Input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Team description"
                    className="w-full px-3 py-2 border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-[var(--color-fg-primary)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)]"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    type="button"
                    onPress={() => setIsCreateDialogOpen(false)}
                    className="flex-1 px-4 py-2 border border-[var(--color-border-primary)] text-[var(--color-fg-primary)] rounded-lg hover:bg-[var(--color-bg-secondary)] font-medium transition-colors"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] text-[color:var(--color-fg-white)] rounded-lg font-medium transition-colors"
                  >
                    Create Team
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Members Dialog */}
      {isMembersDialogOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen p-4 bg-black/50">
            <div className="bg-[var(--color-bg-primary)] rounded-lg shadow-xl dark:shadow-2xl max-w-md w-full p-6 max-h-96 overflow-y-auto">
              <Heading level={2} className="text-2xl font-bold text-[var(--color-fg-primary)] mb-4">
                {selectedTeam?.name} Members
              </Heading>

              {membersLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-brand-500)]"></div>
                </div>
              ) : teamMembers.length === 0 ? (
                <Text className="text-[var(--color-fg-tertiary)] text-center py-8">No members yet</Text>
              ) : (
                <div className="space-y-3">
                  {teamMembers.map((member) => (
                    <div key={member.id} className="flex items-center justify-between p-3 bg-[var(--color-bg-secondary)] rounded-lg">
                      <div className="flex-1 min-w-0">
                        <Text className="font-medium text-[var(--color-fg-primary)]">{member.full_name}</Text>
                        <Text className="text-sm text-[var(--color-fg-tertiary)]">{member.email}</Text>
                      </div>
                      <div className="flex gap-2">
                        <span className="inline-block px-2 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">
                          {member.role}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t border-[var(--color-border-primary)] mt-4 pt-4">
                <Button
                  onPress={() => setIsMembersDialogOpen(false)}
                  className="w-full px-4 py-2 bg-[var(--color-bg-secondary)] hover:bg-[var(--color-border-primary)] text-[var(--color-fg-secondary)] rounded-lg font-medium transition-colors"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
