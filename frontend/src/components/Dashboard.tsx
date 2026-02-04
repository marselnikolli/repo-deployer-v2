import { useEffect, useState } from 'react'
import { Package, CheckCircle, Server } from 'lucide-react'
import { generalApi } from '@/api/client'
import { cx } from '@/utils/cx'
import Analytics from './Analytics'

interface Stats {
  total_repositories: number
  total_cloned: number
  total_deployed: number
  categories: Array<{ category: string; count: number }>
}

export function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [useNewAnalytics, setUseNewAnalytics] = useState(true)

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

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--color-brand-500)] border-t-transparent"></div>
      </div>
    )
  }

  // Use new Analytics component if available
  if (useNewAnalytics) {
    return (
      <div className="space-y-6">
        <h2 className="text-[length:var(--text-display-xs)] font-semibold text-[var(--color-fg-primary)]">
          Dashboard
        </h2>
        <Analytics />
      </div>
    )
  }

  // Fallback to old dashboard
  if (!stats) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--color-brand-500)] border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h2 className="text-[length:var(--text-display-xs)] font-semibold text-[var(--color-fg-primary)]">
        Dashboard
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Total Repositories"
          value={stats.total_repositories}
          icon={<Package className="size-6" />}
          variant="brand"
        />
        <StatCard
          title="Cloned"
          value={stats.total_cloned}
          icon={<CheckCircle className="size-6" />}
          variant="success"
        />
        <StatCard
          title="Deployed"
          value={stats.total_deployed}
          icon={<Server01 className="size-6" />}
          variant="purple"
        />
      </div>

      <div className="bg-[var(--color-bg-primary)] rounded-[var(--radius-xl)] shadow-[var(--shadow-sm)] border border-[var(--color-border-secondary)] p-6">
        <h3 className="text-[length:var(--text-lg)] font-semibold text-[var(--color-fg-primary)] mb-4">
          Repositories by Category
        </h3>
        <div className="space-y-3">
          {stats.categories?.map((cat) => (
            <div key={cat?.category || 'unknown'} className="flex items-center gap-4">
              <span className="text-[length:var(--text-sm)] font-medium text-[var(--color-fg-secondary)] w-24 capitalize">
                {cat?.category?.replace('_', ' ') || 'Unknown'}
              </span>
              <div className="flex-1 bg-[var(--color-bg-tertiary)] rounded-full h-2">
                <div
                  className="bg-[var(--color-brand-500)] h-2 rounded-full transition-all duration-500"
                  style={{
                    width: `${stats.total_repositories > 0 ? ((cat?.count || 0) / stats.total_repositories) * 100 : 0}%`,
                  }}
                />
              </div>
              <span className="text-[length:var(--text-sm)] font-semibold text-[var(--color-fg-primary)] w-8 text-right">
                {cat?.count || 0}
              </span>
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
  icon: React.ReactNode
  variant: 'brand' | 'success' | 'purple'
}

const variantStyles = {
  brand: {
    bg: 'bg-[var(--color-brand-50)]',
    icon: 'text-[var(--color-brand-600)]',
    border: 'border-[var(--color-brand-100)]',
  },
  success: {
    bg: 'bg-[var(--color-success-50)]',
    icon: 'text-[var(--color-success-600)]',
    border: 'border-[var(--color-success-100)]',
  },
  purple: {
    bg: 'bg-[var(--color-purple-50)]',
    icon: 'text-[var(--color-purple-600)]',
    border: 'border-[var(--color-purple-100)]',
  },
}

function StatCard({ title, value, icon, variant }: StatCardProps) {
  const styles = variantStyles[variant]

  return (
    <div
      className={cx(
        'rounded-[var(--radius-xl)] p-6 border',
        styles.bg,
        styles.border
      )}
    >
      <div className={cx('mb-3', styles.icon)}>{icon}</div>
      <p className="text-[length:var(--text-sm)] text-[var(--color-fg-tertiary)]">
        {title}
      </p>
      <p className="text-[length:var(--text-display-xs)] font-semibold text-[var(--color-fg-primary)] mt-1">
        {value}
      </p>
    </div>
  )
}
