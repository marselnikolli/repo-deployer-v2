import { useRef, useState } from 'react'
import { Upload, AlertCircle, CheckCircle, X, File } from 'lucide-react'
import { importApi } from '@/api/client'
import { cx } from '@/utils/cx'
import toast from 'react-hot-toast'

interface ImportState {
  step: 'upload' | 'preview' | 'importing' | 'complete'
  file: File | null
  totalFound: number
  importedCount: number
  message: string
}

export function ImportBookmarks() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [state, setState] = useState<ImportState>({
    step: 'upload',
    file: null,
    totalFound: 0,
    importedCount: 0,
    message: '',
  })

  const handleFileSelect = async (file: File) => {
    if (!file.name.endsWith('.html')) {
      toast.error('Please upload an HTML file')
      return
    }

    setState({
      step: 'preview',
      file,
      totalFound: 0,
      importedCount: 0,
      message: 'Analyzing file...',
    })

    // Parse the file to get count (we'll send it to the server)
    try {
      const response = await importApi.htmlFile(file)
      setState((prev) => ({
        ...prev,
        step: 'preview',
        totalFound: response.data.total_found,
        message: response.data.message,
      }))
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } }
      toast.error(err.response?.data?.detail || 'Failed to analyze file')
      resetState()
    }
  }

  const confirmImport = () => {
    setState((prev) => ({
      ...prev,
      step: 'importing',
      importedCount: 0,
    }))

    // Simulate progress (backend processes in background)
    let progress = 0
    const interval = setInterval(() => {
      progress += Math.random() * 15
      if (progress >= 100) {
        progress = 100
        clearInterval(interval)
        setState((prev) => ({
          ...prev,
          step: 'complete',
          importedCount: prev.totalFound,
        }))
      } else {
        setState((prev) => ({
          ...prev,
          importedCount: Math.floor((progress / 100) * prev.totalFound),
        }))
      }
    }, 200)
  }

  const resetState = () => {
    setState({
      step: 'upload',
      file: null,
      totalFound: 0,
      importedCount: 0,
      message: '',
    })
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) handleFileSelect(file)
  }

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault()
    setIsDragOver(false)
    const file = event.dataTransfer.files?.[0]
    if (file) handleFileSelect(file)
  }

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = () => {
    setIsDragOver(false)
  }

  const progressPercentage =
    state.totalFound > 0 ? (state.importedCount / state.totalFound) * 100 : 0

  return (
    <div className="space-y-6">
      <h2 className="text-[length:var(--text-display-xs)] font-semibold text-[var(--color-fg-primary)]">
        Import Bookmarks
      </h2>

      <div className="bg-[var(--color-bg-primary)] rounded-[var(--radius-xl)] shadow-[var(--shadow-sm)] border border-[var(--color-border-secondary)] p-6">
        {state.step === 'upload' && (
          <>
            <div
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={cx(
                'border-2 border-dashed rounded-[var(--radius-lg)] p-8 text-center cursor-pointer transition-colors',
                isDragOver
                  ? 'border-[var(--color-brand-500)] bg-[var(--color-brand-50)]'
                  : 'border-[var(--color-border-primary)] hover:border-[var(--color-brand-400)] hover:bg-[var(--color-brand-25)]'
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".html"
                onChange={handleInputChange}
                className="hidden"
              />

              <div className="flex justify-center mb-4">
                <div className="w-12 h-12 rounded-[var(--radius-lg)] bg-[var(--color-brand-50)] flex items-center justify-center">
                  <Upload className="size-6 text-[var(--color-brand-600)]" />
                </div>
              </div>

              <p className="text-[length:var(--text-sm)] font-semibold text-[var(--color-fg-primary)]">
                Click to upload
              </p>
              <p className="text-[length:var(--text-sm)] text-[var(--color-fg-quaternary)] mt-1">
                or drag and drop
              </p>
              <p className="text-[length:var(--text-xs)] text-[var(--color-fg-quaternary)] mt-2">
                HTML bookmark file only
              </p>
            </div>

            <div className="mt-6 bg-[var(--color-brand-50)] border border-[var(--color-brand-200)] rounded-[var(--radius-lg)] p-4">
              <div className="flex gap-3">
                <AlertCircle className="size-5 text-[var(--color-brand-600)] flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-[length:var(--text-sm)] font-semibold text-[var(--color-brand-800)]">
                    How to export bookmarks
                  </h3>
                  <ul className="mt-2 text-[length:var(--text-sm)] text-[var(--color-brand-700)] space-y-1">
                    <li>
                      <strong>Chrome:</strong> Menu → Bookmarks → Bookmark manager → Export bookmarks
                    </li>
                    <li>
                      <strong>Firefox:</strong> Menu → Bookmarks → Manage bookmarks → Import and Backup → Export Bookmarks
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </>
        )}

        {state.step === 'preview' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-[var(--radius-lg)] bg-[var(--color-success-50)] flex items-center justify-center">
                  <File06 className="size-5 text-[var(--color-success-600)]" />
                </div>
                <div>
                  <p className="text-[length:var(--text-sm)] font-medium text-[var(--color-fg-primary)]">
                    {state.file?.name}
                  </p>
                  <p className="text-[length:var(--text-xs)] text-[var(--color-fg-tertiary)]">
                    File analyzed successfully
                  </p>
                </div>
              </div>
              <button
                onClick={resetState}
                className="p-2 hover:bg-[var(--color-bg-tertiary)] rounded-[var(--radius-md)] transition-colors"
              >
                <X className="size-5 text-[var(--color-fg-quaternary)]" />
              </button>
            </div>

            <div className="bg-[var(--color-success-50)] border border-[var(--color-success-200)] rounded-[var(--radius-lg)] p-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="size-6 text-[var(--color-success-600)]" />
                <div>
                  <p className="text-[length:var(--text-lg)] font-semibold text-[var(--color-success-800)]">
                    {state.totalFound} GitHub repositories found
                  </p>
                  <p className="text-[length:var(--text-sm)] text-[var(--color-success-700)]">
                    Ready to import to your library
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={resetState}
                className="flex-1 px-4 py-2.5 text-[length:var(--text-sm)] font-medium text-[var(--color-fg-secondary)] bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmImport}
                className="flex-1 px-4 py-2.5 text-[length:var(--text-sm)] font-medium text-white bg-[var(--color-brand-600)] rounded-[var(--radius-lg)] hover:bg-[var(--color-brand-700)] transition-colors"
              >
                Confirm Import
              </button>
            </div>
          </div>
        )}

        {state.step === 'importing' && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto rounded-full bg-[var(--color-brand-50)] flex items-center justify-center mb-4">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--color-brand-500)] border-t-transparent"></div>
              </div>
              <p className="text-[length:var(--text-lg)] font-semibold text-[var(--color-fg-primary)]">
                Importing repositories...
              </p>
              <p className="text-[length:var(--text-sm)] text-[var(--color-fg-tertiary)] mt-1">
                {state.importedCount} of {state.totalFound} repositories
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-[length:var(--text-sm)]">
                <span className="text-[var(--color-fg-tertiary)]">Progress</span>
                <span className="font-medium text-[var(--color-fg-primary)]">
                  {Math.round(progressPercentage)}%
                </span>
              </div>
              <div className="w-full bg-[var(--color-bg-tertiary)] rounded-full h-2">
                <div
                  className="bg-[var(--color-brand-500)] h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {state.step === 'complete' && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto rounded-full bg-[var(--color-success-50)] flex items-center justify-center mb-4">
                <CheckCircle className="size-8 text-[var(--color-success-600)]" />
              </div>
              <p className="text-[length:var(--text-lg)] font-semibold text-[var(--color-fg-primary)]">
                Import Complete!
              </p>
              <p className="text-[length:var(--text-sm)] text-[var(--color-fg-tertiary)] mt-1">
                Successfully imported {state.totalFound} repositories
              </p>
            </div>

            <button
              onClick={resetState}
              className="w-full px-4 py-2.5 text-[length:var(--text-sm)] font-medium text-white bg-[var(--color-brand-600)] rounded-[var(--radius-lg)] hover:bg-[var(--color-brand-700)] transition-colors"
            >
              Import More
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
