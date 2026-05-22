import { useState, useEffect } from 'react'
import { Settings, Save, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'

interface NotificationSettings {
  email_notifications: boolean
  slack_notifications: boolean
  discord_notifications: boolean
  telegram_notifications: boolean
  deployment_alerts: boolean
  health_check_alerts: boolean
  sync_alerts: boolean
  import_alerts: boolean
  error_alerts: boolean
}

export function NotificationSettingsPage() {
  const [settings, setSettings] = useState<NotificationSettings>({
    email_notifications: true,
    slack_notifications: false,
    discord_notifications: false,
    telegram_notifications: false,
    deployment_alerts: true,
    health_check_alerts: true,
    sync_alerts: true,
    import_alerts: true,
    error_alerts: true
  })

  const [webhooks, setWebhooks] = useState({
    slack_webhook: '',
    discord_webhook: '',
    telegram_token: '',
    telegram_chat_id: ''
  })

  const [loading, setLoading] = useState(false)
  // const [showWebhookConfig, setShowWebhookConfig] = useState({ // Not used
  //   slack: false,
  //   discord: false,
  //   telegram: false
  // })

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const response = await fetch('/api/user/notification-settings', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      })
      if (response.ok) {
        const data = await response.json()
        setSettings(data.settings || settings)
        setWebhooks(data.webhooks || webhooks)
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
    }
  }

  const saveSettings = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/user/notification-settings', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ settings, webhooks })
      })
      if (response.ok) {
        toast.success('Notification settings saved')
      } else {
        toast.error('Failed to save settings')
      }
    } catch (error) {
      toast.error('Failed to save settings')
    } finally {
      setLoading(false)
    }
  }

  const toggleSetting = (key: keyof NotificationSettings) => {
    setSettings(prev => ({
      ...prev,
      [key]: !prev[key]
    }))
  }

  const updateWebhook = (key: string, value: string) => {
    setWebhooks(prev => ({
      ...prev,
      [key]: value
    }))
  }

  const testNotification = async (channel: 'slack' | 'discord' | 'telegram') => {
    try {
      const response = await fetch(`/api/notifications/test/${channel}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: 'Test Notification',
          content: 'This is a test notification from Repo Deployer'
        })
      })
      if (response.ok) {
        toast.success(`Test ${channel} notification sent`)
      } else {
        toast.error(`Failed to send test notification`)
      }
    } catch (error) {
      toast.error('Failed to send test notification')
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-secondary)] p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[var(--color-fg-primary)] flex items-center gap-2">
            <Settings size={32} className="text-[var(--color-brand-600)]" />
            Notification Settings
          </h1>
          <p className="text-[var(--color-fg-tertiary)] mt-2">Configure how you receive notifications</p>
        </div>

        {/* Main Settings Card */}
        <div className="bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] shadow-sm border border-[var(--color-border-secondary)] p-6 mb-6">
          <h2 className="text-lg font-semibold text-[var(--color-fg-primary)] mb-4">Notification Channels</h2>

          {/* Channel Toggles */}
          <div className="space-y-4 mb-8">
            {[
              { key: 'email_notifications' as const, label: 'Email Notifications', desc: 'Receive notifications via email' },
              { key: 'slack_notifications' as const, label: 'Slack Notifications', desc: 'Send notifications to Slack' },
              { key: 'discord_notifications' as const, label: 'Discord Notifications', desc: 'Send notifications to Discord' },
              { key: 'telegram_notifications' as const, label: 'Telegram Notifications', desc: 'Send notifications to Telegram' }
            ].map(channel => (
              <div key={channel.key} className="flex items-center justify-between p-4 bg-[var(--color-bg-secondary)] rounded-[var(--radius-lg)] border border-[var(--color-border-secondary)]">
                <div>
                  <p className="font-medium text-[var(--color-fg-primary)]">{channel.label}</p>
                  <p className="text-sm text-[var(--color-fg-tertiary)]">{channel.desc}</p>
                </div>
                <button
                  onClick={() => toggleSetting(channel.key)}
                  className={`px-4 py-2 rounded-[var(--radius-lg)] font-medium transition ${
                    settings[channel.key]
                      ? 'bg-[var(--color-success-100)] text-[var(--color-success-700)]'
                      : 'bg-[var(--color-bg-tertiary)] text-[var(--color-fg-secondary)]'
                  }`}
                >
                  {settings[channel.key] ? 'Enabled' : 'Disabled'}
                </button>
              </div>
            ))}
          </div>

          <hr className="my-6" />

          <h2 className="text-lg font-semibold text-[var(--color-fg-primary)] mb-4">Alert Types</h2>

          {/* Alert Type Toggles */}
          <div className="space-y-4">
            {[
              { key: 'deployment_alerts' as const, label: 'Deployment Alerts', desc: 'Alerts for deployment activities' },
              { key: 'health_check_alerts' as const, label: 'Health Check Alerts', desc: 'Repository health status changes' },
              { key: 'sync_alerts' as const, label: 'Sync Alerts', desc: 'Repository metadata sync results' },
              { key: 'import_alerts' as const, label: 'Import Alerts', desc: 'Repository import progress' },
              { key: 'error_alerts' as const, label: 'Error Alerts', desc: 'Critical errors and failures' }
            ].map(alert => (
              <div key={alert.key} className="flex items-center justify-between p-4 bg-[var(--color-bg-secondary)] rounded-[var(--radius-lg)] border border-[var(--color-border-secondary)]">
                <div>
                  <p className="font-medium text-[var(--color-fg-primary)]">{alert.label}</p>
                  <p className="text-sm text-[var(--color-fg-tertiary)]">{alert.desc}</p>
                </div>
                <button
                  onClick={() => toggleSetting(alert.key)}
                  className={`px-4 py-2 rounded-[var(--radius-lg)] font-medium transition ${
                    settings[alert.key]
                      ? 'bg-[var(--color-brand-100)] text-[var(--color-brand-700)]'
                      : 'bg-[var(--color-bg-tertiary)] text-[var(--color-fg-secondary)]'
                  }`}
                >
                  {settings[alert.key] ? 'On' : 'Off'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Webhook Configuration */}
        <div className="bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] shadow-sm border border-[var(--color-border-secondary)] p-6 mb-6">
          <h2 className="text-lg font-semibold text-[var(--color-fg-primary)] mb-4">Webhook Configuration</h2>

          {/* Slack Webhook */}
          {settings.slack_notifications && (
            <div className="mb-6 p-4 bg-[var(--color-brand-50)] border border-[var(--color-brand-200)] rounded-[var(--radius-lg)]">
              <div className="flex items-center justify-between mb-3">
                <label className="font-medium text-[var(--color-fg-primary)]">Slack Webhook URL</label>
                <button
                  onClick={() => testNotification('slack')}
                  className="px-3 py-1 bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] text-white text-sm rounded transition"
                >
                  Test
                </button>
              </div>
              <input
                type="password"
                placeholder="https://hooks.slack.com/services/..."
                value={webhooks.slack_webhook}
                onChange={e => updateWebhook('slack_webhook', e.target.value)}
                className="w-full px-3 py-2 border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-500)] focus:border-transparent text-sm"
              />
              <p className="text-xs text-[var(--color-fg-tertiary)] mt-2">
                Get your webhook URL from <a href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer" className="text-[var(--color-brand-600)] hover:underline">Slack Apps</a>
              </p>
            </div>
          )}

          {/* Discord Webhook */}
          {settings.discord_notifications && (
            <div className="mb-6 p-4 bg-[var(--color-indigo-50)] border border-indigo-200 rounded-[var(--radius-lg)]">
              <div className="flex items-center justify-between mb-3">
                <label className="font-medium text-[var(--color-fg-primary)]">Discord Webhook URL</label>
                <button
                  onClick={() => testNotification('discord')}
                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded transition"
                >
                  Test
                </button>
              </div>
              <input
                type="password"
                placeholder="https://discord.com/api/webhooks/..."
                value={webhooks.discord_webhook}
                onChange={e => updateWebhook('discord_webhook', e.target.value)}
                className="w-full px-3 py-2 border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-500)] focus:border-transparent text-sm"
              />
              <p className="text-xs text-[var(--color-fg-tertiary)] mt-2">
                Create a webhook in your Discord server settings
              </p>
            </div>
          )}

          {/* Telegram Configuration */}
          {settings.telegram_notifications && (
            <div className="p-4 bg-cyan-50 border border-cyan-200 rounded-[var(--radius-lg)]">
              <div className="flex items-center justify-between mb-3">
                <label className="font-medium text-[var(--color-fg-primary)]">Telegram Configuration</label>
                <button
                  onClick={() => testNotification('telegram')}
                  className="px-3 py-1 bg-cyan-600 hover:bg-cyan-700 text-white text-sm rounded transition"
                >
                  Test
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="password"
                  placeholder="Bot Token"
                  value={webhooks.telegram_token}
                  onChange={e => updateWebhook('telegram_token', e.target.value)}
                  className="px-3 py-2 border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-500)] focus:border-transparent text-sm"
                />
                <input
                  type="password"
                  placeholder="Chat ID"
                  value={webhooks.telegram_chat_id}
                  onChange={e => updateWebhook('telegram_chat_id', e.target.value)}
                  className="px-3 py-2 border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-500)] focus:border-transparent text-sm"
                />
              </div>
              <p className="text-xs text-[var(--color-fg-tertiary)] mt-2">
                Get bot token from <a href="https://t.me/botfather" target="_blank" rel="noopener noreferrer" className="text-cyan-600 hover:underline">@BotFather</a> and chat ID from your bot
              </p>
            </div>
          )}
        </div>

        {/* Save Button */}
        <div className="flex gap-3">
          <button
            onClick={saveSettings}
            disabled={loading}
            className="flex-1 px-6 py-3 bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] disabled:bg-[var(--color-brand-600)] disabled:opacity-50 text-white font-semibold rounded-[var(--radius-lg)] transition flex items-center justify-center gap-2"
          >
            <Save size={20} />
            {loading ? 'Saving...' : 'Save Settings'}
          </button>
          <button
            onClick={loadSettings}
            className="px-6 py-3 bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-border-secondary)] text-[var(--color-fg-primary)] font-semibold rounded-[var(--radius-lg)] transition"
          >
            Reset
          </button>
        </div>

        {/* Info Box */}
        <div className="mt-6 p-4 bg-[var(--color-brand-50)] border border-[var(--color-brand-200)] rounded-[var(--radius-lg)] flex gap-3">
          <AlertCircle size={20} className="text-[var(--color-brand-600)] flex-shrink-0 mt-0.5" />
          <div className="text-sm text-[var(--color-brand-900)]">
            <p className="font-medium">Notification Preferences</p>
            <p className="mt-1">Configure which notification channels are active and what types of alerts you want to receive. Test webhooks before saving.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
