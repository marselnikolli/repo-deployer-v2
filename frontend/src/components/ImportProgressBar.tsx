import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Loader } from 'lucide-react'
import { cx } from '@/utils/cx'
import { ErrorModal } from './ErrorModal'

interface SyncProgress {
  current: number
  total: number
  current_repo: string
  elapsed_seconds: number
  remaining_seconds: number
  success_count: number
  error_count: number
  is_running: boolean
  percentage: number
  is_paused: boolean
  pause_reason: string | null
  resume_in_seconds: number
  sync_error: string | null
}

export function ImportProgressBar() {
  const [progress, setProgress] = useState<SyncProgress | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [completionTime, setCompletionTime] = useState<number | null>(null)
  const [countdownSeconds, setCountdownSeconds] = useState(0)
  const [showErrorModal, setShowErrorModal] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    // Poll for sync progress
    const interval = setInterval(async () => {
      try {
        const response = await fetch('/api/import/sync-progress')
        const data = await response.json()
        setProgress(data)
        
        // Never show error modal - just display pause state in progress bar
        // Errors will be visible through pause message in the progress bar
        
        // Show progress bar only if sync is running or just completed
        if (data.is_running) {
          setIsVisible(true)
          setCompletionTime(null)
        } else if (data.total === 0) {
          setIsVisible(false)
        } else if (data.total > 0 && data.current === data.total) {
          // Sync completed - show completion for 3 seconds then hide
          if (!completionTime) {
            setCompletionTime(Date.now())
          }
          setIsVisible(true)
        }
      } catch (error) {
        console.error('Failed to fetch sync progress:', error)
      }
    }, 500) // Poll every 500ms for smooth updates

    return () => clearInterval(interval)
  }, [completionTime])

  // Auto-hide after 3 seconds of completion
  useEffect(() => {
    if (completionTime) {
      const timer = setTimeout(() => {
        setIsVisible(false)
        setCompletionTime(null)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [completionTime])

  // Countdown timer for pause resume
  useEffect(() => {
    if (progress?.is_paused && progress?.resume_in_seconds > 0) {
      setCountdownSeconds(progress.resume_in_seconds)
      
      const interval = setInterval(() => {
        setCountdownSeconds((prev) => Math.max(0, prev - 1))
      }, 1000)
      
      return () => clearInterval(interval)
    }
  }, [progress?.is_paused, progress?.resume_in_seconds])

  if (!isVisible || !progress) {
    return (
      <ErrorModal
        isOpen={showErrorModal}
        title="Sync Failed"
        message={errorMessage}
        onClose={() => {
          setShowErrorModal(false)
          setErrorMessage('')
        }}
      />
    )
  }

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`
    
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.round(seconds % 60)
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`
    }
    return `${minutes}m ${secs}s`
  }

  const hasErrors = progress.error_count > 0

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-[var(--color-bg-primary)] border-t border-[var(--color-border-secondary)] shadow-[var(--shadow-lg)] z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="space-y-2">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {progress.is_paused ? (
                <AlertCircle size={18} className="text-yellow-500 animate-pulse" />
              ) : progress.is_running ? (
                <Loader size={18} className="text-[var(--color-brand-500)] animate-spin" />
              ) : (
                <CheckCircle2 size={18} className="text-green-500" />
              )}
              <span className="text-sm font-medium text-[var(--color-fg-primary)]">
                {progress.is_paused ? 'Sync Paused' : 'Syncing Repository Metadata'}
              </span>
            </div>
            <div className="text-xs text-[var(--color-fg-tertiary)]">
              {progress.current}/{progress.total} repositories
            </div>
          </div>

          {/* Pause message */}
          {progress.is_paused && (
            <div className={cx(
              "p-3 rounded-[var(--radius-sm)] border",
              progress.pause_reason?.toLowerCase().includes("rate limit") 
                ? "bg-yellow-50 border-yellow-200"
                : "bg-red-50 border-red-200"
            )}>
              <p className={cx(
                "text-xs font-medium",
                progress.pause_reason?.toLowerCase().includes("rate limit")
                  ? "text-yellow-800"
                  : "text-red-800"
              )}>
                <strong>⏸️ Paused:</strong> {progress.pause_reason}
              </p>
              {progress.resume_in_seconds > 0 && (
                <p className={cx(
                  "text-xs mt-1",
                  progress.pause_reason?.toLowerCase().includes("rate limit")
                    ? "text-yellow-700"
                    : "text-red-700"
                )}>
                  Resuming in <strong>{countdownSeconds}s</strong>...
                </p>
              )}
            </div>
          )}

          {/* Control buttons */}
          {progress.is_running || progress.is_paused ? (
            <div className="flex items-center gap-2 justify-end">
              {!progress.is_paused ? (
                <button
                  onClick={() => fetch('/api/import/sync/pause', { method: 'POST' })}
                  className="px-3 py-1 text-xs bg-yellow-500 hover:bg-yellow-600 text-white rounded-[var(--radius-sm)] transition-colors"
                  title="Pause sync"
                >
                  ⏸️ Pause
                </button>
              ) : (
                <button
                  onClick={() => fetch('/api/import/sync/resume', { method: 'POST' })}
                  className="px-3 py-1 text-xs bg-green-500 hover:bg-green-600 text-white rounded-[var(--radius-sm)] transition-colors"
                  title="Resume sync"
                >
                  ▶️ Resume
                </button>
              )}
              <button
                onClick={() => fetch('/api/import/sync/stop', { method: 'POST' })}
                className="px-3 py-1 text-xs bg-red-500 hover:bg-red-600 text-white rounded-[var(--radius-sm)] transition-colors"
                title="Stop sync"
              >
                ⏹️ Stop
              </button>
            </div>
          ) : null}

          {/* Progress bar */}
          <div className="w-full bg-[var(--color-bg-tertiary)] rounded-[var(--radius-sm)] h-2 overflow-hidden">
            <div
              className={cx(
                'h-full transition-all duration-300',
                progress.is_paused
                  ? progress.pause_reason?.toLowerCase().includes("rate limit")
                    ? 'bg-yellow-500'
                    : 'bg-red-500'
                  : hasErrors 
                    ? 'bg-orange-500' 
                    : 'bg-[var(--color-brand-500)]'
              )}
              style={{ width: `${progress.percentage}%` }}
            />
          </div>

          {/* Details */}
          <div className="flex items-center justify-between text-xs text-[var(--color-fg-secondary)]">
            <div className="flex items-center gap-4">
              <span>
                {progress.current_repo ? `Current: ${progress.current_repo}` : 'Starting sync...'}
              </span>
              {hasErrors && (
                <span className="flex items-center gap-1 text-orange-600">
                  <AlertCircle size={14} />
                  {progress.error_count} error{progress.error_count !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <span>
              {progress.is_running
                ? `${formatTime(progress.remaining_seconds)} remaining`
                : 'Complete'} • {progress.success_count} successful
            </span>
          </div>
        </div>
      </div>

      <ErrorModal
        isOpen={showErrorModal}
        title="Sync Failed"
        message={errorMessage}
        onClose={() => {
          setShowErrorModal(false)
          setErrorMessage('')
        }}
      />
    </div>
  )
}
