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
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { api } from '../services/api';
import { Stats } from '../types';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function Analytics() {
  const [stats, setStats] = useState<Stats | null>(null);
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
      const data = await api.getStats();
      setStats(data);
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
        <div className="animate-spin rounded-full h-8 w-8 border border-gray-300 border-t-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
        <p className="font-semibold">Error Loading Analytics</p>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  if (!stats) {
    return <div className="text-center py-8 text-gray-500">No analytics data available</div>;
  }

  // Prepare data for category bar chart
  const categoryData = Object.entries(stats.categories || {}).map(([name, count]) => ({
    name: name.replace('_', ' '),
    repositories: count,
  }));

  // Prepare data for deployment pie chart
  const deploymentData = [
    { name: 'Cloned', value: stats.total_cloned },
    { name: 'Deployed', value: stats.total_deployed },
    { name: 'Not Deployed', value: stats.total_repositories - stats.total_deployed },
  ];

  const pieColors = ['#10b981', '#3b82f6', '#d1d5db'];

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Total Repositories"
          value={stats.total_repositories}
          color="blue"
          icon="📦"
        />
        <StatCard
          title="Cloned"
          value={stats.total_cloned}
          color="green"
          icon="✅"
          percentage={
            stats.total_repositories > 0
              ? Math.round((stats.total_cloned / stats.total_repositories) * 100)
              : 0
          }
        />
        <StatCard
          title="Deployed"
          value={stats.total_deployed}
          color="blue"
          icon="🚀"
          percentage={
            stats.total_repositories > 0
              ? Math.round((stats.total_deployed / stats.total_repositories) * 100)
              : 0
          }
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Bar Chart */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Repositories by Category</h3>
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={categoryData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="repositories" fill="#3b82f6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-gray-500">
              No category data available
            </div>
          )}
        </div>

        {/* Deployment Pie Chart */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Deployment Status</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={deploymentData}
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
                {deploymentData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={pieColors[index % pieColors.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryStat
            label="Clone Rate"
            value={
              stats.total_repositories > 0
                ? `${Math.round((stats.total_cloned / stats.total_repositories) * 100)}%`
                : '0%'
            }
            color="green"
          />
          <SummaryStat
            label="Deploy Rate"
            value={
              stats.total_repositories > 0
                ? `${Math.round((stats.total_deployed / stats.total_repositories) * 100)}%`
                : '0%'
            }
            color="blue"
          />
          <SummaryStat
            label="Not Cloned"
            value={stats.total_repositories - stats.total_cloned}
            color="gray"
          />
          <SummaryStat
            label="Categories"
            value={Object.keys(stats.categories || {}).length}
            color="purple"
          />
        </div>
      </div>

      {/* Last Updated */}
      <div className="text-right text-sm text-gray-500">
        Last updated: {new Date().toLocaleTimeString()}
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: number;
  color: 'blue' | 'green' | 'purple';
  icon: string;
  percentage?: number;
}

function StatCard({ title, value, color, icon, percentage }: StatCardProps) {
  const bgColor = {
    blue: 'bg-blue-50 border-blue-200',
    green: 'bg-green-50 border-green-200',
    purple: 'bg-purple-50 border-purple-200',
  }[color];

  const textColor = {
    blue: 'text-blue-900',
    green: 'text-green-900',
    purple: 'text-purple-900',
  }[color];

  return (
    <div className={`${bgColor} border rounded-lg p-4`}>
      <div className="flex items-start justify-between">
        <div>
          <p className={`${textColor} text-sm font-medium`}>{title}</p>
          <p className={`${textColor} text-2xl font-bold mt-1`}>{value}</p>
          {percentage !== undefined && (
            <p className={`${textColor} text-xs mt-1`}>{percentage}%</p>
          )}
        </div>
        <span className="text-2xl">{icon}</span>
      </div>
    </div>
  );
}

interface SummaryStatProps {
  label: string;
  value: number | string;
  color: string;
}

function SummaryStat({ label, value, color }: SummaryStatProps) {
  const colors = {
    green: 'text-green-600 bg-green-50',
    blue: 'text-blue-600 bg-blue-50',
    gray: 'text-gray-600 bg-gray-50',
    purple: 'text-purple-600 bg-purple-50',
  };

  return (
    <div className={`${colors[color as keyof typeof colors]} rounded-lg p-4 text-center`}>
      <p className="text-sm font-medium mb-1">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
