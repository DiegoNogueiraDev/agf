/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { memo } from 'react'

interface SkeletonProps {
  className?: string
}

/** Single line skeleton */
export const SkeletonLine = memo(function SkeletonLine({ className = 'h-4 w-full' }: SkeletonProps) {
  return (
    <div
      className={`rounded-md bg-surface-elevated animate-pulse motion-reduce:animate-none ${className}`}
      role="status"
      aria-label="Loading"
    />
  )
})

/** Card skeleton with header + body lines */
export const SkeletonCard = memo(function SkeletonCard({ className = '' }: SkeletonProps) {
  return (
    <div className={`rounded-xl border border-edge p-4 space-y-3 ${className}`} role="status" aria-label="Loading card">
      <div className="h-4 w-1/3 rounded-md bg-surface-elevated animate-pulse motion-reduce:animate-none" />
      <div className="space-y-2">
        <div className="h-3 w-full rounded-md bg-surface-elevated animate-pulse motion-reduce:animate-none" />
        <div className="h-3 w-2/3 rounded-md bg-surface-elevated animate-pulse motion-reduce:animate-none" />
      </div>
    </div>
  )
})

/** Chart skeleton with area placeholder */
export const SkeletonChart = memo(function SkeletonChart({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`rounded-xl border border-edge p-4 space-y-3 ${className}`}
      role="status"
      aria-label="Loading chart"
    >
      <div className="h-4 w-1/4 rounded-md bg-surface-elevated animate-pulse motion-reduce:animate-none" />
      <div className="h-40 w-full rounded-lg bg-surface-elevated animate-pulse motion-reduce:animate-none" />
    </div>
  )
})

/** Full-page loading skeleton (replaces "Loading..." text) */
export const SkeletonPage = memo(function SkeletonPage() {
  return (
    <div
      className="h-full w-full overflow-auto p-6 space-y-6 max-w-6xl mx-auto"
      role="status"
      aria-label="Loading page"
    >
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-5 w-40 rounded-md bg-surface-elevated animate-pulse motion-reduce:animate-none" />
        <div className="h-8 w-20 rounded-lg bg-surface-elevated animate-pulse motion-reduce:animate-none" />
      </div>
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SkeletonChart />
        <SkeletonChart />
      </div>
    </div>
  )
})
