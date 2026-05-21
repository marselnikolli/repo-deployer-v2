import { Suspense, lazy } from 'react'
import { Toaster } from 'react-hot-toast'
import { Routes, Route } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import ProtectedRoute from '@/components/ProtectedRoute'

// Eagerly loaded — needed on first paint for every user
import { HomePage } from '@/pages/HomePage'
import LoginPage from '@/pages/LoginPage'
import RegisterPage from '@/pages/RegisterPage'

// Lazily loaded — only pulled when the user navigates to these routes
const GitHubLoginPage            = lazy(() => import('@/pages/GitHubLoginPage'))
const GitHubBookmarksCallbackPage = lazy(() => import('@/pages/GitHubBookmarksCallbackPage'))
const GoogleLoginPage            = lazy(() => import('@/pages/GoogleLoginPage'))
const ForgotPasswordPage         = lazy(() => import('@/pages/ForgotPasswordPage'))
const PasswordResetPage          = lazy(() => import('@/pages/PasswordResetPage'))
const EmailVerificationPage      = lazy(() => import('@/pages/EmailVerificationPage'))
const DockerSetupPage            = lazy(() => import('@/pages/DockerSetupPage'))
const DeploymentPage             = lazy(() => import('@/pages/DeploymentPage').then(m => ({ default: m.DeploymentPage })))
const NotificationSettingsPage   = lazy(() => import('@/pages/NotificationSettingsPage').then(m => ({ default: m.NotificationSettingsPage })))
const UserSettingsPage           = lazy(() => import('@/pages/UserSettingsPage').then(m => ({ default: m.UserSettingsPage })))
const SearchPage                 = lazy(() => import('@/pages/SearchPage').then(m => ({ default: m.SearchPage })))
const ImportsPage                = lazy(() => import('@/pages/ImportsPage'))
const CollectionsPage            = lazy(() => import('@/pages/CollectionsPage'))

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-secondary)]">
      <div className="animate-spin rounded-full h-8 w-8 border border-[var(--color-border-secondary)] border-t-[var(--color-brand-600)]" />
    </div>
  )
}

function App() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-secondary)]">
        <div className="animate-spin rounded-full h-12 w-12 border border-[var(--color-border-secondary)] border-t-[var(--color-brand-600)]"></div>
      </div>
    );
  }

  return (
    <>
      <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<PasswordResetPage />} />
        <Route path="/verify-email" element={<EmailVerificationPage />} />
        <Route path="/auth/github/callback" element={<GitHubLoginPage />} />
        <Route path="/auth/github/bookmarks" element={<GitHubBookmarksCallbackPage />} />
        <Route path="/auth/google/callback" element={<GoogleLoginPage />} />
        <Route path="/docker/setup" element={<DockerSetupPage />} />
        <Route
          path="/deploy"
          element={
            <ProtectedRoute>
              <DeploymentPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/notification-settings"
          element={
            <ProtectedRoute>
              <NotificationSettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/user-settings"
          element={
            <ProtectedRoute>
              <UserSettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/search"
          element={
            <ProtectedRoute>
              <SearchPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/imports"
          element={
            <ProtectedRoute>
              <ImportsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/collections"
          element={
            <ProtectedRoute>
              <CollectionsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <HomePage />
            </ProtectedRoute>
          }
        />
      </Routes>
      </Suspense>
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
