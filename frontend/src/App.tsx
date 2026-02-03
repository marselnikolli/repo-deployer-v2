import { Toaster } from 'react-hot-toast'
import { HomePage } from '@/pages/HomePage'

function App() {
  return (
    <>
      <HomePage />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'var(--color-bg-primary)',
            color: 'var(--color-fg-primary)',
            border: '1px solid var(--color-border-secondary)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-lg)',
          },
          success: {
            iconTheme: {
              primary: 'var(--color-success-600)',
              secondary: 'var(--color-success-50)',
            },
          },
          error: {
            iconTheme: {
              primary: 'var(--color-error-600)',
              secondary: 'var(--color-error-50)',
            },
          },
        }}
      />
    </>
  )
}

export default App
