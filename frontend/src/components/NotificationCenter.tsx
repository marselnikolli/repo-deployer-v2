import { useState } from 'react'
import { Bell, X, Check, CheckCheck, Trash2 } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'

interface Notification {
  id: number
  title: string
  content: string
  type: string
  channel: string
  read: boolean
  sent: boolean
  delivery_status: string
  created_at: string
  updated_at: string
}

interface NotificationStats {
  total: number
  unread: number
  by_type: Record<string, number>
  by_channel: Record<string, number>
  by_delivery_status: Record<string, number>
}

const authHeaders = () => ({
  'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
  'Content-Type': 'application/json',
})

async function fetchNotificationsData(userId: number) {
  const [nRes, sRes] = await Promise.all([
    fetch(`/api/notifications?user_id=${userId}`, { headers: authHeaders() }),
    fetch(`/api/notifications/stats?user_id=${userId}`, { headers: authHeaders() }),
  ])
  const notifications: Notification[] = nRes.ok ? await nRes.json() : []
  const stats: NotificationStats | null = sRes.ok ? await sRes.json() : null
  return { notifications, stats }
}

export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false)
  const qc = useQueryClient()

  const getUserId = (): number | null => {
    try {
      const userData = localStorage.getItem('user')
      if (userData) return JSON.parse(userData).id
    } catch { /* ignore */ }
    return null
  }

  const userId = getUserId()

  const { data } = useQuery({
    queryKey: ['notifications', userId],
    queryFn: () => fetchNotificationsData(userId!),
    enabled: !!userId,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false, // pause when tab is hidden
  })

  const notifications = data?.notifications ?? []
  const stats = data?.stats ?? null

  const invalidate = () => qc.invalidateQueries({ queryKey: ['notifications', userId] })

  const markAsRead = async (id: number) => {
    if (!userId) return

    try {
      const response = await fetch(`/api/notifications/${id}/read?user_id=${userId}`, {
        method: 'POST',
        headers: authHeaders(),
      })
      if (response.ok) {
        invalidate()
        toast.success('Notification marked as read')
      }
    } catch (error) {
      toast.error('Failed to mark notification as read')
    }
  }

  const markAllAsRead = async () => {
    if (!userId) return

    try {
      const response = await fetch(`/api/notifications/read-all?user_id=${userId}`, {
        method: 'POST',
        headers: authHeaders(),
      })
      if (response.ok) {
        invalidate()
        toast.success('All notifications marked as read')
      }
    } catch (error) {
      toast.error('Failed to mark all notifications as read')
    }
  }

  const deleteNotification = async (id: number) => {
    if (!userId) return

    try {
      const response = await fetch(`/api/notifications/${id}?user_id=${userId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (response.ok) {
        invalidate()
        toast.success('Notification deleted')
      }
    } catch (error) {
      toast.error('Failed to delete notification')
    }
  }

  const clearNotifications = async () => {
    if (!userId) return

    try {
      const response = await fetch(`/api/notifications/clear?user_id=${userId}`, {
        method: 'POST',
        headers: authHeaders(),
      })
      if (response.ok) {
        invalidate()
        toast.success('Old notifications cleared')
      }
    } catch (error) {
      toast.error('Failed to clear notifications')
    }
  }

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      success: 'bg-[var(--color-success-50)] text-[var(--color-success-700)] border-[var(--color-success-200)]',
      error: 'bg-[var(--color-error-50)] text-[var(--color-error-700)] border-[var(--color-error-200)]',
      warning: 'bg-[var(--color-warning-50)] text-[var(--color-warning-700)] border-[var(--color-warning-200)]',
      info: 'bg-[var(--color-brand-50)] text-[var(--color-brand-700)] border-[var(--color-brand-200)]',
      deployment: 'bg-[var(--color-purple-50)] text-[var(--color-purple-700)] border-[var(--color-purple-100)]',
      health_check: 'bg-[var(--color-orange-50)] text-[var(--color-orange-700)] border-[var(--color-orange-100)]',
      sync: 'bg-[var(--color-brand-50)] text-[var(--color-brand-700)] border-[var(--color-brand-200)]',
      import: 'bg-[var(--color-indigo-50)] text-[var(--color-indigo-700)] border-[var(--color-indigo-100)]',
    }
    return colors[type] || colors.info
  }

  const getTypeIcon = (type: string) => {
    const icons: Record<string, string> = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    }
    return icons[type] || '•'
  }

  const getDeliveryStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      sent: 'text-[var(--color-success-600)]',
      delivered: 'text-[var(--color-success-500)]',
      failed: 'text-[var(--color-error-600)]',
      pending: 'text-[var(--color-warning-600)]',
    }
    return colors[status] || 'text-[var(--color-fg-tertiary)]'
  }

  const unreadCount = stats?.unread || 0

  return (
    <div className="relative">
      {/* Bell Icon Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-[var(--color-fg-tertiary)] hover:text-[var(--color-fg-primary)] hover:bg-[var(--color-bg-tertiary)] rounded-lg transition"
        title="Notifications"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-semibold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Drawer */}
      {isOpen && (
        <div className="absolute right-0 top-12 w-96 bg-[var(--color-bg-primary)] border border-[var(--color-border-secondary)] rounded-[var(--radius-lg)] shadow-xl z-50 max-h-96 overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)]">
            <div>
              <h3 className="font-semibold text-[var(--color-fg-primary)]">Notifications</h3>
              {stats && <p className="text-xs text-[var(--color-fg-tertiary)]">{stats.unread} unread</p>}
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-[var(--color-bg-tertiary)] rounded transition text-[var(--color-fg-tertiary)]"
            >
              <X size={16} />
            </button>
          </div>

          {/* Notification List */}
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-[var(--color-fg-quaternary)]">
                <Bell size={32} className="mx-auto mb-2 opacity-50" />
                <p>No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--color-border-secondary)]">
                {notifications.slice(0, 10).map(notification => (
                  <div
                    key={notification.id}
                    className={`p-4 border-l-4 transition ${
                      notification.read
                        ? 'bg-[var(--color-bg-secondary)] border-[var(--color-border-primary)]'
                        : `${getTypeColor(notification.type)} border-l-4`
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate text-[var(--color-fg-primary)]">{notification.title}</p>
                        <p className="text-xs text-[var(--color-fg-tertiary)] mt-1 line-clamp-2">
                          {notification.content}
                        </p>
                        <div className="flex items-center gap-2 mt-2 text-xs text-[var(--color-fg-quaternary)]">
                          <span className={`inline-block px-2 py-0.5 rounded ${getDeliveryStatusColor(notification.delivery_status)}`}>
                            {notification.delivery_status}
                          </span>
                          <span className="text-[var(--color-fg-disabled)]">
                            {new Date(notification.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {!notification.read && (
                          <button
                            onClick={() => markAsRead(notification.id)}
                            className="p-1 hover:bg-[var(--color-bg-tertiary)] rounded transition"
                            title="Mark as read"
                          >
                            <Check size={14} className="text-[var(--color-success-600)]" />
                          </button>
                        )}
                        <button
                          onClick={() => deleteNotification(notification.id)}
                          className="p-1 hover:bg-[var(--color-bg-tertiary)] rounded transition"
                          title="Delete"
                        >
                          <Trash2 size={14} className="text-[var(--color-error-600)]" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-[var(--color-border-secondary)] p-3 bg-[var(--color-bg-secondary)] flex gap-2">
              <button
                onClick={markAllAsRead}
                disabled={!stats || stats.unread === 0}
                className="flex-1 px-3 py-2 text-xs bg-[var(--color-brand-50)] hover:bg-[var(--color-brand-100)] text-[var(--color-brand-700)] rounded transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
              >
                <CheckCheck size={14} />
                Read All
              </button>
              <button
                onClick={clearNotifications}
                className="flex-1 px-3 py-2 text-xs bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-border-secondary)] text-[var(--color-fg-secondary)] rounded transition flex items-center justify-center gap-1"
              >
                <Trash2 size={14} />
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
