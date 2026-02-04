import { Toaster } from 'react-hot-toast'
import { Routes, Route } from 'react-router-dom'
import { HomePage } from '@/pages/HomePage'
import LoginPage from '@/pages/LoginPage'
import ProtectedRoute from '@/components/ProtectedRoute'
import { useAuth } from '@/contexts/AuthContext'

function App() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border border-gray-300 border-t-blue-600"></div>
      </div>
    );
  }

  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <HomePage />
            </ProtectedRoute>
          }
        />
      </Routes>
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
