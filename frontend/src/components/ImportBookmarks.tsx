import { useRef, useState } from 'react'
import { Upload, AlertCircle, CheckCircle, X, File as FileIcon } from 'lucide-react'
import { importApi } from '@/api/client'
import { cx } from '@/utils/cx'
import toast from 'react-hot-toast'

interface ImportState {
  step: 'upload' | 'scanning' | 'preview' | 'importing' | 'complete'
  file: File | null
  totalFound: number
  scannedCount: number
  importedCount: number
  duplicatesInFile: number
  duplicatesInDb: number
  newlyImported: number
  message: string
}

export function ImportBookmarks() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [state, setState] = useState<ImportState>({
    step: 'upload',
    file: null,
    totalFound: 0,
    scannedCount: 0,
    importedCount: 0,
    duplicatesInFile: 0,
    duplicatesInDb: 0,
    newlyImported: 0,
    message: '',
  })

  const handleFileSelect = async (file: File) => {
    if (!file.name.endsWith('.html')) {
      toast.error('Please upload an HTML file')
      return
    }

    setState({
      step: 'scanning',
      file,
      totalFound: 0,
      scannedCount: 0,
      importedCount: 0,
      duplicatesInFile: 0,
      duplicatesInDb: 0,
      newlyImported: 0,
      message: 'Analyzing bookmarks...',
    })

    // Simulate scanning progress
    const scanInterval = setInterval(() => {
      setState((prev) => {
        // Gradually increase scanned count up to a reasonable limit
        const nextCount = prev.scannedCount + Math.floor(Math.random() * 10) + 5
        return {
          ...prev,
          scannedCount: Math.min(nextCount, 1000), // Cap at 1000 for simulation
        }
      })
    }, 100)

    // Parse the file to get count
    try {
      const response = await importApi.htmlFile(file)
      clearInterval(scanInterval)
      
      setState((prev) => ({
        ...prev,
        step: 'preview',
        totalFound: response.data.total_found,
        scannedCount: response.data.total_found,
        duplicatesInFile: response.data.duplicates_in_file || 0,
        duplicatesInDb: response.data.duplicates_in_db || 0,
        newlyImported: response.data.newly_imported || response.data.total_found,
        message: response.data.message,
      }))
    } catch (error: unknown) {
      clearInterval(scanInterval)
      const err = error as { response?: { data?: { detail?: string } } }
      toast.error(err.response?.data?.detail || 'Failed to analyze file')
      resetState()
    }
  }

  const confirmImport = async () => {
    if (!state.file) return

    setState((prev) => ({
      ...prev,
      step: 'importing',
      importedCount: 0,
    }))

    try {
      // Simulate progress updates while importing
      const startTime = Date.now()
      const progressInterval = setInterval(() => {
        const elapsed = Date.now() - startTime
        // Gradually increase progress, but leave room for it to reach 100% on complete
        const simulated = Math.min((elapsed / 3000) * 90, 90)
        setState((prev) => ({
          ...prev,
          importedCount: Math.floor((simulated / 100) * state.newlyImported),
        }))
      }, 200)

      // Call the import API
      const response = await importApi.htmlFile(state.file)
      
      clearInterval(progressInterval)

      // Set to 100% complete
      setState((prev) => ({
        ...prev,
        step: 'complete',
        importedCount: prev.newlyImported,
      }))

      toast.success(`Successfully imported ${response.data.newly_imported || state.newlyImported} repositories`)
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } }
      toast.error(err.response?.data?.detail || 'Failed to import repositories')
      setState((prev) => ({
        ...prev,
        step: 'preview',
      }))
    }
  }

  const resetState = () => {
    setState({
      step: 'upload',
      file: null,
      totalFound: 0,
      scannedCount: 0,
      importedCount: 0,
      duplicatesInFile: 0,
      duplicatesInDb: 0,
      newlyImported: 0,
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

        {state.step === 'scanning' && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto rounded-full bg-[var(--color-brand-50)] flex items-center justify-center mb-4">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--color-brand-500)] border-t-transparent"></div>
              </div>
              <p className="text-[length:var(--text-lg)] font-semibold text-[var(--color-fg-primary)]">
                Scanning bookmarks...
              </p>
              <p className="text-[length:var(--text-sm)] text-[var(--color-fg-tertiary)] mt-2">
                {state.scannedCount} URLs scanned
              </p>
            </div>

            <div className="bg-[var(--color-info-50)] border border-[var(--color-info-200)] rounded-[var(--radius-lg)] p-4">
              <div className="space-y-2">
                <p className="text-[length:var(--text-sm)] font-medium text-[var(--color-info-800)]">
                  Scanning Process
                </p>
                <ul className="text-[length:var(--text-xs)] text-[var(--color-info-700)] space-y-1">
                  <li>• Parsing HTML bookmark file</li>
                  <li>• Extracting GitHub repository URLs</li>
                  <li>• Validating repository links</li>
                </ul>
              </div>
            </div>

            <div className="relative h-2 bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden">
              <div
                className="absolute top-0 left-0 h-full bg-[var(--color-brand-500)] rounded-full animate-pulse"
                style={{ width: `${Math.min((state.scannedCount / 500) * 100, 95)}%` }}
              />
            </div>

            <p className="text-center text-[length:var(--text-xs)] text-[var(--color-fg-tertiary)]">
              Processing file... This may take a moment
            </p>
          </div>
        )}

        {state.step === 'preview' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-[var(--radius-lg)] bg-[var(--color-success-50)] flex items-center justify-center">
                  <FileIcon className="size-5 text-[var(--color-success-600)]" />
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

            {(state.duplicatesInFile > 0 || state.duplicatesInDb > 0) && (
              <div className="bg-[var(--color-warning-50)] border border-[var(--color-warning-200)] rounded-[var(--radius-lg)] p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="size-5 text-[var(--color-warning-600)] flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-[length:var(--text-sm)] font-semibold text-[var(--color-warning-800)]">
                      Import Summary
                    </p>
                    <ul className="mt-2 text-[length:var(--text-sm)] text-[var(--color-warning-700)] space-y-1">
                      <li>• <strong>{state.newlyImported}</strong> new repositories to import</li>
                      {state.duplicatesInFile > 0 && (
                        <li>• <strong>{state.duplicatesInFile}</strong> duplicate{state.duplicatesInFile === 1 ? '' : 's'} in this file</li>
                      )}
                      {state.duplicatesInDb > 0 && (
                        <li>• <strong>{state.duplicatesInDb}</strong> already in your database</li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={resetState}
                className="flex-1 px-4 py-2.5 text-[length:var(--text-sm)] font-medium text-[var(--color-fg-secondary)] bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmImport}
                className="flex-1 px-4 py-2.5 text-[length:var(--text-sm)] font-medium text-[color:var(--color-fg-white)] bg-[var(--color-brand-600)] rounded-[var(--radius-lg)] hover:bg-[var(--color-brand-700)] transition-colors"
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
                Processing {state.importedCount} of {state.newlyImported} new repositories
              </p>
              {(state.duplicatesInFile > 0 || state.duplicatesInDb > 0) && (
                <p className="text-[length:var(--text-xs)] text-[var(--color-fg-quaternary)] mt-2">
                  {state.duplicatesInFile + state.duplicatesInDb} duplicates being skipped
                </p>
              )}
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

            <div className="bg-[var(--color-info-50)] border border-[var(--color-info-200)] rounded-[var(--radius-lg)] p-4">
              <div className="space-y-2">
                <p className="text-[length:var(--text-sm)] font-medium text-[var(--color-info-800)]">
                  Import Details
                </p>
                <ul className="text-[length:var(--text-xs)] text-[var(--color-info-700)] space-y-1">
                  <li>• Analyzing repository metadata</li>
                  <li>• Checking for existing repositories</li>
                  <li>• Adding new repositories to database</li>
                </ul>
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
            </div>

            <div className="bg-[var(--color-success-50)] border border-[var(--color-success-200)] rounded-[var(--radius-lg)] p-4">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[length:var(--text-sm)] text-[var(--color-fg-secondary)]">
                    Newly imported
                  </span>
                  <span className="text-[length:var(--text-sm)] font-semibold text-[var(--color-success-700)]">
                    {state.newlyImported}
                  </span>
                </div>
                {state.duplicatesInFile > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-[length:var(--text-sm)] text-[var(--color-fg-secondary)]">
                      Duplicates in file
                    </span>
                    <span className="text-[length:var(--text-sm)] font-semibold text-[var(--color-warning-600)]">
                      {state.duplicatesInFile}
                    </span>
                  </div>
                )}
                {state.duplicatesInDb > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-[length:var(--text-sm)] text-[var(--color-fg-secondary)]">
                      Already in database
                    </span>
                    <span className="text-[length:var(--text-sm)] font-semibold text-[var(--color-warning-600)]">
                      {state.duplicatesInDb}
                    </span>
                  </div>
                )}
                <div className="pt-3 border-t border-[var(--color-success-200)]">
                  <div className="flex justify-between items-center">
                    <span className="text-[length:var(--text-sm)] font-medium text-[var(--color-fg-primary)]">
                      Total processed
                    </span>
                    <span className="text-[length:var(--text-sm)] font-semibold text-[var(--color-success-700)]">
                      {state.totalFound}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={resetState}
              className="w-full px-4 py-2.5 text-[length:var(--text-sm)] font-medium text-[color:var(--color-fg-white)] bg-[var(--color-brand-600)] rounded-[var(--radius-lg)] hover:bg-[var(--color-brand-700)] transition-colors"
            >
              Import More
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
