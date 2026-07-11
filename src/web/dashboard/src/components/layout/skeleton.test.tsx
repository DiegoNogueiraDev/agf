/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SkeletonLine, SkeletonCard, SkeletonChart, SkeletonPage } from './skeleton.js'

describe('<SkeletonLine>', () => {
  it("should expose role=status with 'Loading' aria-label", () => {
    render(<SkeletonLine />)

    const node = screen.getByRole('status')
    expect(node).toHaveAttribute('aria-label', 'Loading')
  })

  it('should default to h-4 w-full sizing', () => {
    const { container } = render(<SkeletonLine />)

    const node = container.firstChild as HTMLElement
    expect(node.className).toContain('h-4')
    expect(node.className).toContain('w-full')
  })

  it('should override sizing via className prop', () => {
    const { container } = render(<SkeletonLine className="h-8 w-1/2" />)

    const node = container.firstChild as HTMLElement
    expect(node.className).toContain('h-8')
    expect(node.className).toContain('w-1/2')
    // Default sizing should NOT leak through.
    expect(node.className).not.toContain('h-4')
  })

  it('should keep animate-pulse with motion-reduce override', () => {
    const { container } = render(<SkeletonLine />)

    const node = container.firstChild as HTMLElement
    expect(node.className).toContain('animate-pulse')
    expect(node.className).toContain('motion-reduce:animate-none')
  })
})

describe('<SkeletonCard>', () => {
  it("should render with role=status and 'Loading card' aria-label", () => {
    render(<SkeletonCard />)

    expect(screen.getByLabelText('Loading card')).toBeInTheDocument()
  })

  it('should render exactly 3 inner pulse elements (header + 2 body lines)', () => {
    const { container } = render(<SkeletonCard />)

    const pulses = container.querySelectorAll('.animate-pulse')
    expect(pulses).toHaveLength(3)
  })
})

describe('<SkeletonChart>', () => {
  it("should render with role=status and 'Loading chart' aria-label", () => {
    render(<SkeletonChart />)

    expect(screen.getByLabelText('Loading chart')).toBeInTheDocument()
  })

  it('should render exactly 2 inner pulse elements (label + chart area)', () => {
    const { container } = render(<SkeletonChart />)

    const pulses = container.querySelectorAll('.animate-pulse')
    expect(pulses).toHaveLength(2)
  })
})

describe('<SkeletonPage>', () => {
  it("should render with role=status and 'Loading page' aria-label", () => {
    render(<SkeletonPage />)

    expect(screen.getByLabelText('Loading page')).toBeInTheDocument()
  })

  it('should compose 4 SkeletonCards + 2 SkeletonCharts', () => {
    render(<SkeletonPage />)

    // SkeletonCard exposes 'Loading card' aria-label, SkeletonChart exposes
    // 'Loading chart'. Counting them confirms the dashboard layout.
    expect(screen.getAllByLabelText('Loading card')).toHaveLength(4)
    expect(screen.getAllByLabelText('Loading chart')).toHaveLength(2)
  })
})
