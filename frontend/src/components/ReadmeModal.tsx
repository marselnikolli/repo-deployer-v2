import { useEffect, useState } from 'react'
import { X, ExternalLink, FileText, Loader2, AlertCircle } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

interface ReadmeModalProps {
  repoName: string
  repoUrl: string
  onClose: () => void
}

function rawReadmeUrls(repoUrl: string): string[] {
  // github.com/owner/repo → raw.githubusercontent.com/owner/repo/{branch}/README.md
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/)
  if (!match) return []
  const [, owner, repo] = match
  return ['HEAD', 'main', 'master'].map(
    branch => `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/README.md`
  )
}

export function ReadmeModal({ repoName, repoUrl, onClose }: ReadmeModalProps) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchReadme() {
      const urls = rawReadmeUrls(repoUrl)
      if (urls.length === 0) {
        setError('Cannot parse GitHub URL')
        setLoading(false)
        return
      }

      for (const url of urls) {
        try {
          const res = await fetch(url)
          if (res.ok) {
            const text = await res.text()
            if (!cancelled) setContent(text)
            return
          }
        } catch {
          // try next branch
        }
      }

      if (!cancelled) setError('README.md not found for this repository')
    }

    fetchReadme()
      .catch(e => { if (!cancelled) setError(e.message || 'Failed to load README') })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [repoUrl])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-bg-primary)] rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-secondary)] flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="size-5 text-[var(--color-fg-tertiary)] flex-shrink-0" />
            <h2 className="text-base font-semibold text-[var(--color-fg-primary)] truncate">
              {repoName}
            </h2>
            <span className="text-sm text-[var(--color-fg-tertiary)] flex-shrink-0">/ README.md</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-4">
            <a
              href={`${repoUrl}/blob/HEAD/README.md`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-[var(--color-brand-600)] bg-[var(--color-brand-50)] border border-[var(--color-brand-200)] rounded-lg hover:bg-[var(--color-brand-100)] transition-colors"
            >
              <ExternalLink className="size-3" />
              View on GitHub
            </a>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors"
            >
              <X className="size-5 text-[var(--color-fg-tertiary)]" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 min-h-0">
          {loading && (
            <div className="flex items-center justify-center h-40 gap-3 text-[var(--color-fg-tertiary)]">
              <Loader2 className="size-5 animate-spin" />
              <span className="text-sm">Loading README…</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              <AlertCircle className="size-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {content && (
            <div className="prose prose-sm max-w-none
              text-[var(--color-fg-primary)]
              prose-headings:text-[var(--color-fg-primary)]
              prose-headings:font-semibold
              prose-h1:text-xl prose-h1:border-b prose-h1:border-[var(--color-border-secondary)] prose-h1:pb-2
              prose-h2:text-lg prose-h2:border-b prose-h2:border-[var(--color-border-secondary)] prose-h2:pb-1
              prose-a:text-[var(--color-brand-600)] prose-a:no-underline hover:prose-a:underline
              prose-code:bg-[var(--color-bg-secondary)] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono prose-code:before:content-none prose-code:after:content-none
              prose-pre:bg-[var(--color-bg-secondary)] prose-pre:border prose-pre:border-[var(--color-border-secondary)] prose-pre:rounded-lg prose-pre:overflow-x-auto
              prose-blockquote:border-l-[var(--color-brand-400)] prose-blockquote:text-[var(--color-fg-secondary)]
              prose-hr:border-[var(--color-border-secondary)]
              prose-strong:text-[var(--color-fg-primary)]
              prose-img:rounded-lg prose-img:max-w-full
              prose-li:text-[var(--color-fg-primary)]
              prose-table:text-sm
              prose-th:bg-[var(--color-bg-secondary)] prose-th:px-3 prose-th:py-2
              prose-td:px-3 prose-td:py-2
            ">
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
