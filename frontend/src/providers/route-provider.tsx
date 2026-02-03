import { RouterProvider } from 'react-aria-components'
import { useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'

interface RouteProviderProps {
  children: ReactNode
}

export function RouteProvider({ children }: RouteProviderProps) {
  const navigate = useNavigate()

  return (
    <RouterProvider navigate={navigate}>
      {children}
    </RouterProvider>
  )
}
