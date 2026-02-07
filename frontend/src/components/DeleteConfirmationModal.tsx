import React, { useEffect } from 'react'
import { X } from 'lucide-react'

interface DeleteConfirmationModalProps {
  isOpen: boolean
  title: string
  message: string
  itemCount?: number
  onConfirm: () => void
  onCancel: () => void
  isLoading?: boolean
}

export const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
  isOpen,
  title,
  message,
  itemCount,
  onConfirm,
  onCancel,
  isLoading = false,
}) => {
  // Handle keyboard shortcuts (Escape to close, Enter to confirm)
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel()
      } else if (e.key === 'Enter') {
        onConfirm()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onCancel, onConfirm])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Message */}
        <div className="mb-6">
          <p className="text-gray-700">{message}</p>
          {itemCount && itemCount > 0 && (
            <p className="text-sm text-gray-500 mt-2">
              {itemCount} item{itemCount !== 1 ? 's' : ''} will be permanently deleted.
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="px-4 py-2 text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {isLoading && (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            Delete
          </button>
        </div>

        {/* Keyboard hints */}
        <div className="mt-4 text-xs text-gray-500 text-center">
          <p>Press <kbd className="bg-gray-100 px-2 py-1 rounded">Esc</kbd> to cancel or <kbd className="bg-gray-100 px-2 py-1 rounded">Enter</kbd> to confirm</p>
        </div>
      </div>
    </div>
  )
}
