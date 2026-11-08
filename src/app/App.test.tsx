import { render, screen } from '@testing-library/react'
import { App } from './App'

it('renders the product mark', () => {
  render(<App />)
  expect(screen.getByText('Risk Forge')).toBeInTheDocument()
})
