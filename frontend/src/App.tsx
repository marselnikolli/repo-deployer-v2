import { Toaster } from 'react-hot-toast'
import { Routes, Route } from 'react-router-dom'
import { HomePage } from '@/pages/HomePage'
import LoginPage from '@/pages/LoginPage'
import RegisterPage from '@/pages/RegisterPage'
import GitHubLoginPage from '@/pages/GitHubLoginPage'
import GoogleLoginPage from '@/pages/GoogleLoginPage'
import DockerSetupPage from '@/pages/DockerSetupPage'
import { DeploymentPage } from '@/pages/DeploymentPage'
import { SchedulerPage } from '@/pages/SchedulerPage'
import { NotificationSettingsPage } from '@/pages/NotificationSettingsPage'
import { SearchPage } from '@/pages/SearchPage'
import TeamsPage from '@/pages/TeamsPage'
import ImportsPage from '@/pages/ImportsPage'
import CollectionsPage from '@/pages/CollectionsPage'
import ProtectedRoute from '@/components/ProtectedRoute'
import { useAuth } from '@/contexts/AuthContext'

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
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/auth/github/callback" element={<GitHubLoginPage />} />
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
          path="/scheduler"
          element={
            <ProtectedRoute>
              <SchedulerPage />
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
          path="/search"
          element={
            <ProtectedRoute>
              <SearchPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/teams"
          element={
            <ProtectedRoute>
              <TeamsPage />
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
