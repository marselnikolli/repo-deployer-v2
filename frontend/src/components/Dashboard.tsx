import React, { useEffect, useState } from 'react'
import { generalApi } from '../api/client'

interface Stats {
  total_repositories: number
  total_cloned: number
  total_deployed: number
  categories: Array<{ name: string; count: number }>
}

export const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      const response = await generalApi.stats()
      setStats(response.data)
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading || !stats) {
    return <div className="text-center py-8">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Total Repositories"
          value={stats.total_repositories}
          icon="📦"
          color="bg-blue-100"
        />
        <StatCard
          title="Cloned"
          value={stats.total_cloned}
          icon="✓"
          color="bg-green-100"
        />
        <StatCard
          title="Deployed"
          value={stats.total_deployed}
          icon="🐳"
          color="bg-purple-100"
        />
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Repositories by Category</h2>
        <div className="space-y-2">
          {stats.categories.map((cat) => (
            <div key={cat.name} className="flex items-center">
              <span className="text-sm font-medium text-gray-700 w-24">{cat.name}</span>
              <div className="flex-1 bg-gray-200 rounded-full h-2 mx-4">
                <div
                  className="bg-blue-500 h-2 rounded-full"
                  style={{
                    width: `${(cat.count / stats.total_repositories) * 100}%`
                  }}
                ></div>
              </div>
              <span className="text-sm font-semibold text-gray-700 w-12 text-right">{cat.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

interface StatCardProps {
  title: string
  value: number
  icon: string
  color: string
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, color }) => (
  <div className={`${color} rounded-lg shadow-md p-6`}>
    <div className="text-3xl mb-2">{icon}</div>
    <p className="text-sm text-gray-600">{title}</p>
    <p className="text-3xl font-bold text-gray-900">{value}</p>
  </div>
)
