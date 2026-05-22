import React, { useEffect } from 'react'
import { X, AlertTriangle } from 'lucide-react'

interface ErrorModalProps {
  isOpen: boolean
  title: string
  message: string
  onClose: () => void
}

export const ErrorModal: React.FC<ErrorModalProps> = ({
  isOpen,
  title,
  message,
  onClose,
}) => {
  // Handle keyboard shortcuts (Escape to close)
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[var(--color-bg-primary)] rounded-[var(--radius-xl)] shadow-lg p-6 max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[var(--color-error-100)] flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={20} className="text-[var(--color-error-600)]" />
            </div>
            <h2 className="text-lg font-semibold text-[var(--color-fg-primary)]">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--color-fg-disabled)] hover:text-[var(--color-fg-tertiary)] transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Message */}
        <div className="mb-6">
          <p className="text-[var(--color-fg-secondary)] text-sm whitespace-pre-wrap break-words">{message}</p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-[var(--color-fg-secondary)] bg-[var(--color-bg-tertiary)] rounded-[var(--radius-md)] hover:bg-[var(--color-border-secondary)] transition-colors font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
