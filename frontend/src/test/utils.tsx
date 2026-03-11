/* eslint-disable react-refresh/only-export-components */
import { render, type RenderOptions } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { type ReactNode } from 'react'

function AllProviders({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>
}

export function renderWithRouter(ui: ReactNode, options?: RenderOptions) {
  return render(ui, { wrapper: AllProviders, ...options })
}

export * from '@testing-library/react'
