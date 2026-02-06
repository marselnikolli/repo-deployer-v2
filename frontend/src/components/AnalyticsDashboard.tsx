import { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, Package, Star, Activity, Code, PieChart as PieChartIcon, Zap } from 'lucide-react';

interface DashboardStats {
  total_repos: number;
  total_stars: number;
  avg_stars: number;
  total_updates: number;
  languages: Record<string, number>;
  status_breakdown: Record<string, number>;
  recent_repos: Array<{
    id: number;
    name: string;
    url: string;
    stars: number;
    language: string | null;
    last_updated: string | null;
  }>;
}

interface TopRepo {
  id: number;
  name: string;
  url: string;
  stars: number;
  language: string | null;
  description: string | null;
}

export function AnalyticsDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [topRepos, setTopRepos] = useState<TopRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [statsRes, topReposRes] = await Promise.all([
          fetch('/api/analytics/dashboard'),
          fetch('/api/analytics/top-repos?limit=5')
        ]);

        if (!statsRes.ok || !topReposRes.ok) {
          throw new Error('Failed to fetch analytics');
        }

        const statsData = await statsRes.json();
        const topReposData = await topReposRes.json();

        setStats(statsData);
        setTopRepos(topReposData);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load analytics');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border border-gray-300 border-t-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-[var(--color-error-100)] dark:bg-[var(--color-error-900)] border border-[var(--color-error-300)] dark:border-[var(--color-error-800)] rounded-lg text-[var(--color-error-700)] dark:text-[var(--color-error-200)]">
        {error}
      </div>
    );
  }

  if (!stats) {
    return <div>No data available</div>;
  }

  // Sort languages by count
  const sortedLanguages = Object.entries(stats.languages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const totalLanguages = Object.keys(stats.languages).length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BarChart3 className="w-8 h-8 text-[var(--color-blue-icon)]" />
        <div>
          <h2 className="text-2xl font-bold text-[var(--color-fg-primary)]">Analytics Dashboard</h2>
          <p className="text-sm text-[var(--color-fg-tertiary)]">Repository insights and statistics</p>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Repositories */}
        <div className="bg-[var(--color-bg-primary)] rounded-lg border border-[var(--color-border-secondary)] p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-[var(--color-fg-tertiary)] font-medium">Total Repositories</p>
              <p className="text-3xl font-bold text-[var(--color-fg-primary)] mt-2">{stats.total_repos}</p>
            </div>
            <div className="p-3 bg-[var(--color-blue-bg)] rounded-lg">
              <Package className="w-6 h-6 text-[var(--color-blue-icon)]" />
            </div>
          </div>
        </div>

        {/* Total Stars */}
        <div className="bg-[var(--color-bg-primary)] rounded-lg border border-[var(--color-border-secondary)] p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-[var(--color-fg-tertiary)] font-medium">Total Stars</p>
              <p className="text-3xl font-bold text-[var(--color-fg-primary)] mt-2">{stats.total_stars.toLocaleString()}</p>
            </div>
            <div className="p-3 bg-[var(--color-yellow-bg)] rounded-lg">
              <Star className="w-6 h-6 text-[var(--color-yellow-icon)]" />
            </div>
          </div>
        </div>

        {/* Average Stars */}
        <div className="bg-[var(--color-bg-primary)] rounded-lg border border-[var(--color-border-secondary)] p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-[var(--color-fg-tertiary)] font-medium">Average Stars</p>
              <p className="text-3xl font-bold text-[var(--color-fg-primary)] mt-2">{stats.avg_stars.toFixed(1)}</p>
            </div>
            <div className="p-3 bg-[var(--color-green-bg)] rounded-lg">
              <TrendingUp className="w-6 h-6 text-[var(--color-green-icon)]" />
            </div>
          </div>
        </div>

        {/* Recent Updates */}
        <div className="bg-[var(--color-bg-primary)] rounded-lg border border-[var(--color-border-secondary)] p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-[var(--color-fg-tertiary)] font-medium">Last 30 Days</p>
              <p className="text-3xl font-bold text-[var(--color-fg-primary)] mt-2">{stats.total_updates}</p>
              <p className="text-xs text-[var(--color-fg-quaternary)] mt-2">updates</p>
            </div>
            <div className="p-3 bg-[var(--color-purple-bg)] rounded-lg">
              <Activity className="w-6 h-6 text-[var(--color-purple-icon)]" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Languages */}
        <div className="bg-[var(--color-bg-primary)] rounded-lg border border-[var(--color-border-secondary)] p-6">
          <div className="flex items-center gap-2 mb-6">
            <Code className="w-5 h-5 text-[var(--color-blue-icon)]" />
            <h3 className="text-lg font-semibold text-[var(--color-fg-primary)]">Top Languages</h3>
          </div>
          <div className="space-y-4">
            {sortedLanguages.map(([lang, count], idx) => {
              const percentage = (count / stats.total_repos) * 100;
              const colors = [
                'bg-[var(--color-blue-icon)]',
                'bg-[var(--color-green-icon)]',
                'bg-[var(--color-purple-icon)]',
                'bg-[var(--color-orange-icon)]',
                'bg-[var(--color-red-icon)]'
              ];
              return (
                <div key={lang}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-[var(--color-fg-secondary)]">{lang}</span>
                    <span className="text-sm text-[var(--color-fg-tertiary)]">{count} repos</span>
                  </div>
                  <div className="w-full bg-[var(--color-bg-tertiary)] rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${colors[idx % colors.length]}`}
                      style={{ width: `${percentage}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
            {totalLanguages > 5 && (
              <p className="text-xs text-[var(--color-fg-quaternary)] pt-2">
                +{totalLanguages - 5} more languages
              </p>
            )}
          </div>
        </div>

        {/* Status Breakdown */}
        <div className="bg-[var(--color-bg-primary)] rounded-lg border border-[var(--color-border-secondary)] p-6">
          <div className="flex items-center gap-2 mb-6">
            <PieChartIcon className="w-5 h-5 text-[var(--color-green-icon)]" />
            <h3 className="text-lg font-semibold text-[var(--color-fg-primary)]">Status Breakdown</h3>
          </div>
          <div className="space-y-3">
            {Object.entries(stats.status_breakdown).map(([status, count]) => {
              const total = stats.total_repos;
              const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : '0';
              const statusColors: Record<string, string> = {
                active: 'bg-[var(--color-green-bg)] text-[var(--color-green-text)] border-[var(--color-green-bg)]',
                archived: 'bg-[var(--color-gray-100)] dark:bg-[var(--color-gray-900)] text-[var(--color-gray-700)] dark:text-[var(--color-gray-300)] border-[var(--color-gray-300)] dark:border-[var(--color-gray-700)]',
                private: 'bg-[var(--color-blue-bg)] text-[var(--color-blue-text)] border-[var(--color-blue-bg)]',
                fork: 'bg-[var(--color-purple-bg)] text-[var(--color-purple-text)] border-[var(--color-purple-bg)]'
              };
              return (
                <div key={status} className="flex items-center justify-between p-3 rounded border border-[var(--color-border-secondary)]">
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[status] || 'bg-[var(--color-gray-100)] dark:bg-[var(--color-gray-900)] text-[var(--color-gray-700)] dark:text-[var(--color-gray-300)]'}`}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </span>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-[var(--color-fg-primary)]">{count}</p>
                    <p className="text-xs text-[var(--color-fg-tertiary)]">{percentage}%</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Top Repositories */}
      <div className="bg-[var(--color-bg-primary)] rounded-lg border border-[var(--color-border-secondary)] p-6">
        <div className="flex items-center gap-2 mb-6">
          <Zap className="w-5 h-5 text-[var(--color-orange-icon)]" />
          <h3 className="text-lg font-semibold text-[var(--color-fg-primary)]">Top Repositories by Stars</h3>
        </div>
        <div className="space-y-3">
          {topRepos.map((repo, idx) => (
            <a
              key={repo.id}
              href={repo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-4 rounded border border-[var(--color-border-secondary)] hover:bg-[var(--color-bg-tertiary)] transition"
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[var(--color-fg-quaternary)] bg-[var(--color-bg-tertiary)] px-2 py-1 rounded">
                      #{idx + 1}
                    </span>
                    <h4 className="font-semibold text-[var(--color-fg-primary)] hover:text-[var(--color-brand-600)]">
                      {repo.name}
                    </h4>
                  </div>
                  {repo.description && (
                    <p className="text-sm text-[var(--color-fg-tertiary)] mt-1 line-clamp-1">
                      {repo.description}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4">
                {repo.language && (
                  <span className="text-xs px-2 py-1 bg-[var(--color-blue-bg)] text-[var(--color-blue-text)] rounded">
                    {repo.language}
                  </span>
                )}
                <div className="flex items-center gap-1">
                  <Star className="w-4 h-4 text-[var(--color-yellow-icon)]" />
                  <span className="text-sm font-medium text-[var(--color-fg-secondary)]">
                    {repo.stars.toLocaleString()}
                  </span>
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>

      {/* Recent Updates Timeline */}
      <div className="bg-[var(--color-bg-primary)] rounded-lg border border-[var(--color-border-secondary)] p-6">
        <div className="flex items-center gap-2 mb-6">
          <Activity className="w-5 h-5 text-[var(--color-green-icon)]" />
          <h3 className="text-lg font-semibold text-[var(--color-fg-primary)]">Recent Updates</h3>
        </div>
        <div className="space-y-3">
          {stats.recent_repos.map((repo) => (
            <div key={repo.id} className="flex items-start justify-between p-3 rounded border border-[var(--color-border-secondary)]">
              <div>
                <a
                  href={repo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-[var(--color-brand-600)] hover:text-[var(--color-brand-700)]"
                >
                  {repo.name}
                </a>
                {repo.language && (
                  <span className="ml-2 text-xs px-2 py-0.5 bg-[var(--color-gray-100)] dark:bg-[var(--color-gray-900)] text-[var(--color-gray-700)] dark:text-[var(--color-gray-300)] rounded">
                    {repo.language}
                  </span>
                )}
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1 mb-1">
                  <Star className="w-4 h-4 text-[var(--color-yellow-icon)]" />
                  <span className="text-sm font-medium text-[var(--color-fg-secondary)]">
                    {repo.stars}
                  </span>
                </div>
                {repo.last_updated && (
                  <p className="text-xs text-[var(--color-fg-tertiary)]">
                    {new Date(repo.last_updated).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
