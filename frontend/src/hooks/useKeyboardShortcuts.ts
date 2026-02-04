import { useEffect, useCallback } from 'react'

interface ShortcutHandlers {
  onSearch?: () => void
  onNextItem?: () => void
  onPrevItem?: () => void
  onSelectItem?: () => void
  onDelete?: () => void
  onClone?: () => void
  onClearSelection?: () => void
  onSelectAll?: () => void
  onExport?: () => void
  onRefresh?: () => void
  onOpenDetails?: () => void
  onEscape?: () => void
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers, enabled: boolean = true) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields
      const target = event.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        // Only allow Escape in input fields
        if (event.key === 'Escape' && handlers.onEscape) {
          handlers.onEscape()
          event.preventDefault()
        }
        return
      }

      // Prevent default browser behavior for our shortcuts
      const key = event.key.toLowerCase()
      const ctrl = event.ctrlKey || event.metaKey
      const shift = event.shiftKey

      switch (key) {
        case '/':
          // Focus search
          if (handlers.onSearch) {
            event.preventDefault()
            handlers.onSearch()
          }
          break

        case 'j':
          // Next item
          if (!ctrl && handlers.onNextItem) {
            event.preventDefault()
            handlers.onNextItem()
          }
          break

        case 'k':
          // Previous item
          if (!ctrl && handlers.onPrevItem) {
            event.preventDefault()
            handlers.onPrevItem()
          }
          break

        case 'enter':
        case ' ':
          // Select/toggle current item or open details
          if (handlers.onSelectItem) {
            event.preventDefault()
            handlers.onSelectItem()
          }
          break

        case 'o':
          // Open details
          if (handlers.onOpenDetails) {
            event.preventDefault()
            handlers.onOpenDetails()
          }
          break

        case 'd':
          // Delete selected
          if (!ctrl && handlers.onDelete) {
            event.preventDefault()
            handlers.onDelete()
          }
          break

        case 'c':
          // Clone selected
          if (!ctrl && handlers.onClone) {
            event.preventDefault()
            handlers.onClone()
          }
          break

        case 'escape':
          // Clear selection or close modal
          if (handlers.onEscape) {
            event.preventDefault()
            handlers.onEscape()
          } else if (handlers.onClearSelection) {
            event.preventDefault()
            handlers.onClearSelection()
          }
          break

        case 'a':
          // Select all (Ctrl+A)
          if (ctrl && handlers.onSelectAll) {
            event.preventDefault()
            handlers.onSelectAll()
          }
          break

        case 'e':
          // Export (Ctrl+E)
          if (ctrl && handlers.onExport) {
            event.preventDefault()
            handlers.onExport()
          }
          break

        case 'r':
          // Refresh (Ctrl+R - but careful, this is browser refresh)
          if (ctrl && shift && handlers.onRefresh) {
            event.preventDefault()
            handlers.onRefresh()
          }
          break
      }
    },
    [handlers]
  )

  useEffect(() => {
    if (!enabled) return

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown, enabled])
}

// Help text for keyboard shortcuts
export const KEYBOARD_SHORTCUTS = [
  { key: '/', description: 'Focus search' },
  { key: 'j', description: 'Next item' },
  { key: 'k', description: 'Previous item' },
  { key: 'Enter/Space', description: 'Toggle selection' },
  { key: 'o', description: 'Open details' },
  { key: 'd', description: 'Delete selected' },
  { key: 'c', description: 'Clone selected' },
  { key: 'Esc', description: 'Clear selection' },
  { key: 'Ctrl+A', description: 'Select all' },
  { key: 'Ctrl+E', description: 'Export' },
  { key: 'Ctrl+Shift+R', description: 'Refresh' },
]
