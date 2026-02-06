import { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Code, TrendingUp, Package, Star, Activity } from 'lucide-react';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

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

export default function Analytics() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [topRepos, setTopRepos] = useState<TopRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      setError(undefined);
      const [statsRes, topReposRes] = await Promise.all([
        fetch('/api/analytics/dashboard'),
        fetch('/api/analytics/top-repos?limit=5'),
      ]);

      if (!statsRes.ok || !topReposRes.ok) {
        throw new Error('Failed to fetch analytics');
      }

      const statsData = await statsRes.json();
      const topReposData = await topReposRes.json();

      setStats(statsData);
      setTopRepos(topReposData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
      console.error('Analytics error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border border-[var(--color-border-secondary)] border-t-[var(--color-brand-500)]"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[var(--color-error-100)] dark:bg-[var(--color-error-900)] border border-[var(--color-error-300)] dark:border-[var(--color-error-800)] rounded-lg p-4 text-[var(--color-error-700)] dark:text-[var(--color-error-200)]">
        <p className="font-semibold">Error Loading Analytics</p>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  if (!stats) {
    return <div className="text-center py-8 text-[var(--color-fg-tertiary)]">No analytics data available</div>;
  }

  // Prepare language data for bar chart
  const languageData = Object.entries(stats.languages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({
      name,
      repositories: count,
    }));

  // Prepare status data for pie chart
  const statusData = Object.entries(stats.status_breakdown).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value,
  }));

  const pieColors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'];

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Repositories"
          value={stats.total_repos}
          color="blue"
          icon={<Package className="w-6 h-6" />}
        />
        <StatCard
          title="Total Stars"
          value={stats.total_stars}
          color="yellow"
          icon={<Star className="w-6 h-6" />}
        />
        <StatCard
          title="Average Stars"
          value={stats.avg_stars.toFixed(1)}
          color="green"
          icon={<TrendingUp className="w-6 h-6" />}
        />
        <StatCard
          title="Recent Updates (30d)"
          value={stats.total_updates}
          color="purple"
          icon={<Activity className="w-6 h-6" />}
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Language Bar Chart */}
        <div className="bg-[var(--color-bg-primary)] rounded-lg shadow-md p-6">
          <div className="flex items-center gap-2 mb-4">
            <Code className="w-5 h-5 text-[var(--color-blue-icon)]" />
            <h3 className="text-lg font-semibold text-[var(--color-fg-primary)]">Languages Used</h3>
          </div>
          {languageData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={languageData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="repositories" fill="#1570EF" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-[var(--color-fg-tertiary)]">
              No language data available
            </div>
          )}
        </div>

        {/* Status Pie Chart */}
        <div className="bg-[var(--color-bg-primary)] rounded-lg shadow-md p-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-[var(--color-green-icon)]" />
            <h3 className="text-lg font-semibold text-[var(--color-fg-primary)]">Repository Status</h3>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={statusData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value, percent }) =>
                  `${name}: ${value} (${(percent * 100).toFixed(0)}%)`
                }
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {statusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={pieColors[index % pieColors.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="bg-[var(--color-bg-primary)] rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold text-[var(--color-fg-primary)] mb-4">Quick Stats</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryStat
            label="Total Repos"
            value={stats.total_repos}
            color="blue"
          />
          <SummaryStat
            label="Total Stars"
            value={stats.total_stars.toLocaleString()}
            color="yellow"
          />
          <SummaryStat
            label="Languages"
            value={Object.keys(stats.languages).length}
            color="purple"
          />
          <SummaryStat
            label="Updated (30d)"
            value={stats.total_updates}
            color="green"
          />
        </div>
      </div>

      {/* Top Repositories */}
      <div className="bg-[var(--color-bg-primary)] rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold text-[var(--color-fg-primary)] mb-4">Top Repositories</h3>
        <div className="space-y-3">
          {topRepos.map((repo, idx) => (
            <a
              key={repo.id}
              href={repo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-4 rounded border border-[var(--color-border-secondary)] hover:border-[var(--color-border-primary)] hover:bg-[var(--color-bg-tertiary)] transition"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[var(--color-fg-secondary)] bg-[var(--color-bg-secondary)] px-2 py-1 rounded">
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
              <div className="flex items-center gap-4 mt-2">
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

      {/* Last Updated */}
      <div className="text-right text-sm text-[var(--color-fg-tertiary)]">
        Last updated: {new Date().toLocaleTimeString()}
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string | number;
  color: 'blue' | 'green' | 'purple' | 'yellow';
  icon: React.ReactNode;
}

function StatCard({ title, value, color, icon }: StatCardProps) {
  const bgColor = {
    blue: 'bg-[var(--color-blue-bg)] dark:bg-[var(--color-blue-bg)] border-[var(--color-blue-bg)]',
    green: 'bg-[var(--color-green-bg)] dark:bg-[var(--color-green-bg)] border-[var(--color-green-bg)]',
    purple: 'bg-[var(--color-purple-bg)] dark:bg-[var(--color-purple-bg)] border-[var(--color-purple-bg)]',
    yellow: 'bg-[var(--color-yellow-bg)] dark:bg-[var(--color-yellow-bg)] border-[var(--color-yellow-bg)]',
  }[color];

  const textColor = {
    blue: 'text-[var(--color-blue-text)]',
    green: 'text-[var(--color-green-text)]',
    purple: 'text-[var(--color-purple-text)]',
    yellow: 'text-[var(--color-yellow-text)]',
  }[color];

  const iconColor = {
    blue: 'text-[var(--color-blue-icon)]',
    green: 'text-[var(--color-green-icon)]',
    purple: 'text-[var(--color-purple-icon)]',
    yellow: 'text-[var(--color-yellow-icon)]',
  }[color];

  return (
    <div className={`${bgColor} border rounded-lg p-4`}>
      <div className="flex items-start justify-between">
        <div>
          <p className={`${textColor} text-sm font-medium`}>{title}</p>
          <p className={`${textColor} text-2xl font-bold mt-1`}>{value}</p>
        </div>
        <div className={`${iconColor}`}>{icon}</div>
      </div>
    </div>
  );
}

interface SummaryStatProps {
  label: string;
  value: number | string;
  color: 'green' | 'blue' | 'gray' | 'purple' | 'yellow';
}

function SummaryStat({ label, value, color }: SummaryStatProps) {
  const colors = {
    green: 'text-[var(--color-green-text)] bg-[var(--color-green-bg)]',
    blue: 'text-[var(--color-blue-text)] bg-[var(--color-blue-bg)]',
    gray: 'text-[var(--color-fg-secondary)] bg-[var(--color-bg-tertiary)]',
    purple: 'text-[var(--color-purple-text)] bg-[var(--color-purple-bg)]',
    yellow: 'text-[var(--color-yellow-text)] bg-[var(--color-yellow-bg)]',
  };

  return (
    <div className={`${colors[color as keyof typeof colors]} rounded-lg p-4 text-center`}>
      <p className="text-sm font-medium mb-1">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
