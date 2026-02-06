import { useState } from 'react'
import { Activity, CheckCircle, AlertCircle, BarChart3 } from 'lucide-react'
import toast from 'react-hot-toast'
import axios from 'axios'

interface ScanResults {
  total_files_found: number
  unique_files: number
  duplicate_files: number
  duplicates_by_name: Record<string, number>
  files_by_type: Record<string, number>
  repositories_scanned: number
  scan_duration_seconds: number
}

interface CollectionScannerProps {
  collectionId: number
  collectionName: string
}

export function CollectionScanner({ collectionId, collectionName }: CollectionScannerProps) {
  const [isScanning, setIsScanning] = useState(false)
  const [scanResults, setScanResults] = useState<ScanResults | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleStartScan = async () => {
    setIsScanning(true)
    setError(null)
    setScanResults(null)

    try {
      const response = await axios.post(`/api/collections/${collectionId}/scan`)
      setScanResults(response.data)
      toast.success('Scan completed successfully!')
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || 'Failed to scan collection'
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setIsScanning(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-[var(--color-bg-primary)] rounded-[var(--radius-xl)] shadow-[var(--shadow-sm)] border border-[var(--color-border-secondary)] p-6">
        {!scanResults && !isScanning && !error && (
          <div className="space-y-4">
            <div>
              <h3 className="text-[length:var(--text-lg)] font-semibold text-[var(--color-fg-primary)]">
                Scan Repository Files
              </h3>
              <p className="text-[length:var(--text-sm)] text-[var(--color-fg-tertiary)] mt-1">
                Analyze all repositories in "{collectionName}" to detect duplicate files and gather statistics.
              </p>
            </div>

            <p className="text-[length:var(--text-sm)] text-[var(--color-fg-secondary)] bg-[var(--color-bg-tertiary)] rounded-[var(--radius-lg)] p-3">
              This scan will:
            </p>
            <ul className="text-[length:var(--text-sm)] text-[var(--color-fg-secondary)] space-y-2">
              <li className="flex items-center gap-2">
                <span className="text-[var(--color-success-600)]">✓</span> Scan all files in each repository
              </li>
              <li className="flex items-center gap-2">
                <span className="text-[var(--color-success-600)]">✓</span> Detect duplicate filenames across repositories
              </li>
              <li className="flex items-center gap-2">
                <span className="text-[var(--color-success-600)]">✓</span> Generate file type statistics
              </li>
              <li className="flex items-center gap-2">
                <span className="text-[var(--color-info-600)]">ℹ</span> Does not modify any files
              </li>
            </ul>

            <button
              onClick={handleStartScan}
              disabled={isScanning}
              className="w-full px-4 py-2.5 text-[length:var(--text-sm)] font-medium text-[color:var(--color-fg-white)] bg-[var(--color-brand-600)] rounded-[var(--radius-lg)] hover:bg-[var(--color-brand-700)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isScanning ? 'Scanning...' : 'Start Scan'}
            </button>
          </div>
        )}

        {isScanning && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto rounded-full bg-[var(--color-brand-50)] flex items-center justify-center mb-4">
                <div className="animate-spin">
                  <Activity className="size-8 text-[var(--color-brand-600)]" />
                </div>
              </div>
              <p className="text-[length:var(--text-lg)] font-semibold text-[var(--color-fg-primary)]">
                Scanning repository files…
              </p>
              <p className="text-[length:var(--text-sm)] text-[var(--color-fg-tertiary)] mt-2">
                Please wait while we analyze your collection. This may take a moment depending on the number and size of repositories.
              </p>
            </div>

            <div className="flex items-center justify-center gap-1">
              <div className="h-1 w-1 rounded-full bg-[var(--color-brand-500)] animate-bounce" style={{ animationDelay: '0s' }}></div>
              <div className="h-1 w-1 rounded-full bg-[var(--color-brand-500)] animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              <div className="h-1 w-1 rounded-full bg-[var(--color-brand-500)] animate-bounce" style={{ animationDelay: '0.4s' }}></div>
            </div>
          </div>
        )}

        {error && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 bg-[var(--color-error-50)] border border-[var(--color-error-200)] rounded-[var(--radius-lg)] p-4">
              <AlertCircle className="size-5 text-[var(--color-error-600)] flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-[var(--color-error-800)]">Scan Failed</p>
                <p className="text-[length:var(--text-sm)] text-[var(--color-error-700)] mt-1">{error}</p>
              </div>
            </div>

            <button
              onClick={handleStartScan}
              className="w-full px-4 py-2.5 text-[length:var(--text-sm)] font-medium text-[color:var(--color-fg-white)] bg-[var(--color-brand-600)] rounded-[var(--radius-lg)] hover:bg-[var(--color-brand-700)] transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {scanResults && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[var(--color-success-50)] flex items-center justify-center">
                <CheckCircle className="size-6 text-[var(--color-success-600)]" />
              </div>
              <div>
                <p className="text-[length:var(--text-lg)] font-semibold text-[var(--color-fg-primary)]">
                  Scan Complete!
                </p>
                <p className="text-[length:var(--text-sm)] text-[var(--color-fg-tertiary)]">
                  Completed in {scanResults.scan_duration_seconds}s
                </p>
              </div>
            </div>

            {/* Main Statistics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Total Files */}
              <div className="bg-[var(--color-bg-tertiary)] rounded-[var(--radius-lg)] p-4">
                <p className="text-[length:var(--text-xs)] text-[var(--color-fg-tertiary)] uppercase font-semibold">
                  Total Files
                </p>
                <p className="text-[length:var(--text-2xl)] font-bold text-[var(--color-fg-primary)] mt-2">
                  {scanResults.total_files_found.toLocaleString()}
                </p>
              </div>

              {/* Unique Files */}
              <div className="bg-[var(--color-success-50)] rounded-[var(--radius-lg)] p-4 border border-[var(--color-success-200)]">
                <p className="text-[length:var(--text-xs)] text-[var(--color-success-700)] uppercase font-semibold">
                  Unique Files
                </p>
                <p className="text-[length:var(--text-2xl)] font-bold text-[var(--color-success-600)] mt-2">
                  {scanResults.unique_files.toLocaleString()}
                </p>
              </div>

              {/* Duplicate Files */}
              <div className={`${
                scanResults.duplicate_files > 0
                  ? 'bg-[var(--color-warning-50)] border border-[var(--color-warning-200)]'
                  : 'bg-[var(--color-bg-tertiary)]'
              } rounded-[var(--radius-lg)] p-4`}>
                <p className={`text-[length:var(--text-xs)] uppercase font-semibold ${
                  scanResults.duplicate_files > 0
                    ? 'text-[var(--color-warning-700)]'
                    : 'text-[var(--color-fg-tertiary)]'
                }`}>
                  Duplicate Files
                </p>
                <p className={`text-[length:var(--text-2xl)] font-bold mt-2 ${
                  scanResults.duplicate_files > 0
                    ? 'text-[var(--color-warning-600)]'
                    : 'text-[var(--color-success-600)]'
                }`}>
                  {scanResults.duplicate_files.toLocaleString()}
                </p>
              </div>

              {/* Repositories Scanned */}
              <div className="bg-[var(--color-bg-tertiary)] rounded-[var(--radius-lg)] p-4">
                <p className="text-[length:var(--text-xs)] text-[var(--color-fg-tertiary)] uppercase font-semibold">
                  Repos Scanned
                </p>
                <p className="text-[length:var(--text-2xl)] font-bold text-[var(--color-fg-primary)] mt-2">
                  {scanResults.repositories_scanned.toLocaleString()}
                </p>
              </div>
            </div>

            {/* Duplicate Details */}
            {scanResults.duplicate_files > 0 && (
              <div className="bg-[var(--color-warning-50)] border border-[var(--color-warning-200)] rounded-[var(--radius-lg)] p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="size-5 text-[var(--color-warning-600)] flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold text-[var(--color-warning-800)]">
                      {scanResults.duplicate_files} Duplicate Files Found
                    </p>
                    <p className="text-[length:var(--text-sm)] text-[var(--color-warning-700)] mt-1">
                      The following filenames appear in multiple repositories:
                    </p>
                    <div className="mt-3 max-h-64 overflow-y-auto">
                      <ul className="text-[length:var(--text-sm)] text-[var(--color-warning-700)] space-y-1">
                        {Object.entries(scanResults.duplicates_by_name)
                          .sort((a, b) => b[1] - a[1])
                          .slice(0, 20)
                          .map(([filename, count]) => (
                            <li key={filename} className="flex justify-between items-center">
                              <code className="bg-[var(--color-warning-100)] px-2 py-1 rounded text-[length:var(--text-xs)]">
                                {filename}
                              </code>
                              <span className="font-semibold">{count}×</span>
                            </li>
                          ))}
                      </ul>
                      {Object.keys(scanResults.duplicates_by_name).length > 20 && (
                        <p className="text-[length:var(--text-xs)] text-[var(--color-warning-600)] mt-2 font-medium">
                          +{Object.keys(scanResults.duplicates_by_name).length - 20} more duplicates
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* File Type Statistics */}
            {Object.keys(scanResults.files_by_type).length > 0 && (
              <div className="bg-[var(--color-bg-tertiary)] rounded-[var(--radius-lg)] p-4">
                <div className="flex items-center gap-2 mb-3">
                  <BarChart3 className="size-5 text-[var(--color-brand-600)]" />
                  <p className="font-semibold text-[var(--color-fg-primary)]">File Types</p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {Object.entries(scanResults.files_by_type)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 12)
                    .map(([ext, count]) => (
                      <div key={ext} className="bg-[var(--color-bg-primary)] rounded-[var(--radius-md)] p-2 text-center">
                        <p className="text-[length:var(--text-xs)] text-[var(--color-fg-tertiary)] font-medium">
                          {ext || 'no ext'}
                        </p>
                        <p className="text-[length:var(--text-sm)] font-bold text-[var(--color-fg-primary)]">
                          {count.toLocaleString()}
                        </p>
                      </div>
                    ))}
                </div>
                {Object.keys(scanResults.files_by_type).length > 12 && (
                  <p className="text-[length:var(--text-xs)] text-[var(--color-fg-tertiary)] mt-2">
                    +{Object.keys(scanResults.files_by_type).length - 12} more file types
                  </p>
                )}
              </div>
            )}

            <button
              onClick={() => setScanResults(null)}
              className="w-full px-4 py-2.5 text-[length:var(--text-sm)] font-medium text-[color:var(--color-fg-white)] bg-[var(--color-brand-600)] rounded-[var(--radius-lg)] hover:bg-[var(--color-brand-700)] transition-colors"
            >
              Run Another Scan
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
