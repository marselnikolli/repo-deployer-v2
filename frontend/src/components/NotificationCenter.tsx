import { useState, useEffect } from 'react'
import { Bell, X, Check, CheckCheck, Trash2 } from 'lucide-react'
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

export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [stats, setStats] = useState<NotificationStats | null>(null)
  // const [loading, setLoading] = useState(false) // Not used

  // Get current user ID from localStorage or context
  const getUserId = () => {
    try {
      const userData = localStorage.getItem('user')
      if (userData) {
        const user = JSON.parse(userData)
        return user.id
      }
    } catch (e) {
      console.error('Failed to get user ID')
    }
    return null
  }

  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 10000) // Poll every 10 seconds
    return () => clearInterval(interval)
  }, [])

  const fetchNotifications = async () => {
    const userId = getUserId()
    if (!userId) return

    try {
      const response = await fetch(`/api/notifications?user_id=${userId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })
      if (response.ok) {
        const data = await response.json()
        setNotifications(data)
      }

      const statsResponse = await fetch(`/api/notifications/stats?user_id=${userId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })
      if (statsResponse.ok) {
        const statsData = await statsResponse.json()
        setStats(statsData)
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error)
    }
  }

  const markAsRead = async (id: number) => {
    const userId = getUserId()
    if (!userId) return

    try {
      const response = await fetch(`/api/notifications/${id}/read?user_id=${userId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })
      if (response.ok) {
        await fetchNotifications()
        toast.success('Notification marked as read')
      }
    } catch (error) {
      toast.error('Failed to mark notification as read')
    }
  }

  const markAllAsRead = async () => {
    const userId = getUserId()
    if (!userId) return

    try {
      const response = await fetch(`/api/notifications/read-all?user_id=${userId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })
      if (response.ok) {
        await fetchNotifications()
        toast.success('All notifications marked as read')
      }
    } catch (error) {
      toast.error('Failed to mark all notifications as read')
    }
  }

  const deleteNotification = async (id: number) => {
    const userId = getUserId()
    if (!userId) return

    try {
      const response = await fetch(`/api/notifications/${id}?user_id=${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })
      if (response.ok) {
        await fetchNotifications()
        toast.success('Notification deleted')
      }
    } catch (error) {
      toast.error('Failed to delete notification')
    }
  }

  const clearNotifications = async () => {
    const userId = getUserId()
    if (!userId) return

    try {
      const response = await fetch(`/api/notifications/clear?user_id=${userId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })
      if (response.ok) {
        await fetchNotifications()
        toast.success('Old notifications cleared')
      }
    } catch (error) {
      toast.error('Failed to clear notifications')
    }
  }

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      success: 'bg-green-50 text-green-900 border-green-200',
      error: 'bg-red-50 text-red-900 border-red-200',
      warning: 'bg-yellow-50 text-yellow-900 border-yellow-200',
      info: 'bg-blue-50 text-blue-900 border-blue-200',
      deployment: 'bg-purple-50 text-purple-900 border-purple-200',
      health_check: 'bg-orange-50 text-orange-900 border-orange-200',
      sync: 'bg-cyan-50 text-cyan-900 border-cyan-200',
      import: 'bg-indigo-50 text-indigo-900 border-indigo-200'
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
      sent: 'text-green-600',
      delivered: 'text-green-500',
      failed: 'text-red-600',
      pending: 'text-yellow-600'
    }
    return colors[status] || 'text-gray-600'
  }

  const unreadCount = stats?.unread || 0

  return (
    <div className="relative">
      {/* Bell Icon Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"
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
        <div className="absolute right-0 top-12 w-96 bg-white border border-gray-200 rounded-lg shadow-xl z-50 max-h-96 overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
            <div>
              <h3 className="font-semibold text-gray-900">Notifications</h3>
              {stats && <p className="text-xs text-gray-600">{stats.unread} unread</p>}
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-gray-200 rounded transition"
            >
              <X size={16} />
            </button>
          </div>

          {/* Notification List */}
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Bell size={32} className="mx-auto mb-2 opacity-50" />
                <p>No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {notifications.slice(0, 10).map(notification => (
                  <div
                    key={notification.id}
                    className={`p-4 border-l-4 transition ${
                      notification.read
                        ? 'bg-gray-50 border-gray-300'
                        : `${getTypeColor(notification.type)} border-l-4`
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{notification.title}</p>
                        <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                          {notification.content}
                        </p>
                        <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                          <span className={`inline-block px-2 py-0.5 rounded ${getDeliveryStatusColor(notification.delivery_status)}`}>
                            {notification.delivery_status}
                          </span>
                          <span className="text-gray-400">
                            {new Date(notification.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {!notification.read && (
                          <button
                            onClick={() => markAsRead(notification.id)}
                            className="p-1 hover:bg-gray-300 rounded transition"
                            title="Mark as read"
                          >
                            <Check size={14} className="text-green-600" />
                          </button>
                        )}
                        <button
                          onClick={() => deleteNotification(notification.id)}
                          className="p-1 hover:bg-gray-300 rounded transition"
                          title="Delete"
                        >
                          <Trash2 size={14} className="text-red-600" />
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
            <div className="border-t border-gray-200 p-3 bg-gray-50 flex gap-2">
              <button
                onClick={markAllAsRead}
                disabled={!stats || stats.unread === 0}
                className="flex-1 px-3 py-2 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 rounded transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
              >
                <CheckCheck size={14} />
                Read All
              </button>
              <button
                onClick={clearNotifications}
                className="flex-1 px-3 py-2 text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 rounded transition flex items-center justify-center gap-1"
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
