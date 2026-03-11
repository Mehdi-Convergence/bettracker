import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithRouter } from '../test/utils'
import Login from '../pages/Login'

const mockNavigate = vi.fn()
const mockLogin = vi.fn()
const mockRegister = vi.fn()

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    login: mockLogin,
    register: mockRegister,
    user: null,
    token: null,
    loading: false,
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Login page — branding panel', () => {
  it('affiche le titre principal', () => {
    renderWithRouter(<Login />)
    expect(screen.getByText('Pariez plus')).toBeInTheDocument()
    expect(screen.getByText('intelligemment')).toBeInTheDocument()
  })

  it('affiche les stats clés', () => {
    renderWithRouter(<Login />)
    expect(screen.getAllByText('+14.2%').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('63%')).toBeInTheDocument()
    expect(screen.getByText('38k+')).toBeInTheDocument()
    expect(screen.getByText('ROI moyen')).toBeInTheDocument()
    expect(screen.getByText('Taux de réussite')).toBeInTheDocument()
  })

  it('affiche les 4 features', () => {
    renderWithRouter(<Login />)
    expect(screen.getByText(/Scan automatique/)).toBeInTheDocument()
    expect(screen.getByText(/Suivi ROI/)).toBeInTheDocument()
    expect(screen.getByText(/Campagnes auto-pilotées/)).toBeInTheDocument()
    expect(screen.getByText(/IA Analyste/)).toBeInTheDocument()
  })

  it('affiche la preuve sociale', () => {
    renderWithRouter(<Login />)
    expect(screen.getByText(/1 240 bettors/)).toBeInTheDocument()
  })
})

describe('Login page — formulaire connexion', () => {
  it('affiche le formulaire de connexion par défaut', () => {
    renderWithRouter(<Login />)
    expect(screen.getByRole('heading', { name: 'Bon retour' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('votre@email.com')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Votre mot de passe')).toBeInTheDocument()
  })

  it('passe en mode inscription au clic sur "Créer un compte"', () => {
    renderWithRouter(<Login />)
    fireEvent.click(screen.getByRole('button', { name: 'Créer un compte' }))
    expect(screen.getByRole('heading', { name: 'Créez votre compte' })).toBeInTheDocument()
  })

  it('appelle login et redirige vers / en cas de succès', async () => {
    mockLogin.mockResolvedValueOnce(undefined)
    renderWithRouter(<Login />)
    fireEvent.change(screen.getByPlaceholderText('votre@email.com'), { target: { value: 'test@test.com' } })
    fireEvent.change(screen.getByPlaceholderText('Votre mot de passe'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: /Se connecter/ }))
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('test@test.com', 'password123')
      expect(mockNavigate).toHaveBeenCalledWith('/')
    })
  })

  it("affiche un message d'erreur si login échoue", async () => {
    mockLogin.mockRejectedValueOnce(new Error('Identifiants invalides'))
    renderWithRouter(<Login />)
    fireEvent.change(screen.getByPlaceholderText('votre@email.com'), { target: { value: 'bad@test.com' } })
    fireEvent.change(screen.getByPlaceholderText('Votre mot de passe'), { target: { value: 'wrongpass' } })
    fireEvent.click(screen.getByRole('button', { name: /Se connecter/ }))
    await waitFor(() => {
      expect(screen.getByText('Identifiants invalides')).toBeInTheDocument()
    })
  })
})

describe('Login page — formulaire inscription', () => {
  beforeEach(() => {
    renderWithRouter(<Login />)
    fireEvent.click(screen.getByRole('button', { name: 'Créer un compte' }))
  })

  it('affiche le badge essai gratuit', () => {
    expect(screen.getByText(/Aucune CB requise/)).toBeInTheDocument()
  })

  it('valide la longueur du mot de passe (min 8 caractères)', async () => {
    fireEvent.change(screen.getByPlaceholderText('ex: ValueBettor_99'), { target: { value: 'TestUser' } })
    fireEvent.change(screen.getAllByPlaceholderText('votre@email.com')[0], { target: { value: 'new@test.com' } })
    fireEvent.change(screen.getByPlaceholderText('Min. 8 caractères'), { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: /Créer mon compte/ }))
    await waitFor(() => {
      expect(screen.getByText('Min. 8 caractères')).toBeInTheDocument()
    })
    expect(mockRegister).not.toHaveBeenCalled()
  })

  it('appelle register et redirige vers / en cas de succès', async () => {
    mockRegister.mockResolvedValueOnce(undefined)
    fireEvent.change(screen.getByPlaceholderText('ex: ValueBettor_99'), { target: { value: 'TestUser' } })
    fireEvent.change(screen.getAllByPlaceholderText('votre@email.com')[0], { target: { value: 'new@test.com' } })
    fireEvent.change(screen.getByPlaceholderText('Min. 8 caractères'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: /Créer mon compte/ }))
    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith('new@test.com', 'password123', 'TestUser')
      expect(mockNavigate).toHaveBeenCalledWith('/')
    })
  })
})
