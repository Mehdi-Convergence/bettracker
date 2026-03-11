import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom'

// Reproduction locale de ProtectedRoute et PublicRoute pour les tester isolément
function ProtectedRoute({ children, user, loading }: { children: React.ReactNode; user: unknown; loading: boolean }) {
  if (loading) return <div>Chargement...</div>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function PublicRoute({ children, user, loading }: { children: React.ReactNode; user: unknown; loading: boolean }) {
  if (loading) return null
  if (user) return <Navigate to="/" replace />
  return <>{children}</>
}

describe('ProtectedRoute', () => {
  it('redirige vers /login si utilisateur non connecté', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/login" element={<div>Page Login</div>} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute user={null} loading={false}>
                <div>Dashboard</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByText('Page Login')).toBeInTheDocument()
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
  })

  it('affiche le contenu si utilisateur connecté', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/login" element={<div>Page Login</div>} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute user={{ id: 1 }} loading={false}>
                <div>Dashboard</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.queryByText('Page Login')).not.toBeInTheDocument()
  })

  it('affiche le loader pendant le chargement', () => {
    render(
      <MemoryRouter>
        <ProtectedRoute user={null} loading={true}>
          <div>Contenu protégé</div>
        </ProtectedRoute>
      </MemoryRouter>
    )
    expect(screen.getByText('Chargement...')).toBeInTheDocument()
    expect(screen.queryByText('Contenu protégé')).not.toBeInTheDocument()
  })
})

describe('PublicRoute', () => {
  it('redirige vers / si utilisateur déjà connecté', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/" element={<div>Dashboard</div>} />
          <Route
            path="/login"
            element={
              <PublicRoute user={{ id: 1 }} loading={false}>
                <div>Page Login</div>
              </PublicRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.queryByText('Page Login')).not.toBeInTheDocument()
  })

  it('affiche le contenu si utilisateur non connecté', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/" element={<div>Dashboard</div>} />
          <Route
            path="/login"
            element={
              <PublicRoute user={null} loading={false}>
                <div>Page Login</div>
              </PublicRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByText('Page Login')).toBeInTheDocument()
  })
})
