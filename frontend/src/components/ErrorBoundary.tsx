import { ReactNode, Component, ErrorInfo } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[var(--color-bg-secondary)] flex items-center justify-center p-4">
          <div className="bg-[var(--color-bg-primary)] rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)] border border-[var(--color-error-200)] p-8 max-w-md">
            <h1 className="text-[length:var(--text-lg)] font-semibold text-[var(--color-error-600)] mb-3">
              ⚠️ Something went wrong
            </h1>
            <p className="text-[length:var(--text-sm)] text-[var(--color-fg-secondary)] mb-4">
              {this.state.error?.message || 'An unexpected error occurred. Please try refreshing the page.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full px-4 py-2 bg-[var(--color-brand-500)] text-white rounded-[var(--radius-md)] hover:bg-[var(--color-brand-600)] transition-colors text-[length:var(--text-sm)] font-medium"
            >
              Refresh Page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
