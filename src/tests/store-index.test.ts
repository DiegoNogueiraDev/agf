/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'

describe('store/index.ts barrel exports', () => {
  it('exports AgentRegistry class', async () => {
    const mod = await import('../core/store/index.js')
    expect(mod.AgentRegistry).toBeDefined()
    expect(typeof mod.AgentRegistry).toBe('function')
  })

  it('exports GraphSnapshotCache class', async () => {
    const mod = await import('../core/store/index.js')
    expect(mod.GraphSnapshotCache).toBeDefined()
  })

  it('exports LockManager class', async () => {
    const mod = await import('../core/store/index.js')
    expect(mod.LockManager).toBeDefined()
  })

  it('exports runMigrations and configureDb', async () => {
    const mod = await import('../core/store/index.js')
    expect(mod.runMigrations).toBeDefined()
    expect(mod.configureDb).toBeDefined()
  })

  it('exports resolveStorePath', async () => {
    const mod = await import('../core/store/index.js')
    expect(mod.resolveStorePath).toBeDefined()
  })

  it('exports SqliteStore class', async () => {
    const mod = await import('../core/store/index.js')
    expect(mod.SqliteStore).toBeDefined()
  })

  it('exports StoreManager class', async () => {
    const mod = await import('../core/store/index.js')
    expect(mod.StoreManager).toBeDefined()
  })

  it('exports ToolCallLog class', async () => {
    const mod = await import('../core/store/index.js')
    expect(mod.ToolCallLog).toBeDefined()
  })

  it('exports ToolTokenStore class', async () => {
    const mod = await import('../core/store/index.js')
    expect(mod.ToolTokenStore).toBeDefined()
  })

  it('exports ToolCallEntry type', async () => {
    const mod = await import('../core/store/index.js')
    expect(mod.ToolCallEntry).toBeUndefined()
  })

  it('exports ToolTokenEntry, ToolTokenAggregate, ToolTokenSummary types', async () => {
    const mod = await import('../core/store/index.js')
    expect(mod.ToolTokenEntry).toBeUndefined()
    expect(mod.ToolTokenAggregate).toBeUndefined()
    expect(mod.ToolTokenSummary).toBeUndefined()
  })

  it('exports StoreRef type from StoreManager', async () => {
    const mod = await import('../core/store/index.js')
    expect(mod.StoreRef).toBeUndefined()
  })

  it('exports MutationOptions type', async () => {
    const mod = await import('../core/store/index.js')
    expect(mod.MutationOptions).toBeUndefined()
  })

  it('exports LockResult and LockInfo types', async () => {
    const mod = await import('../core/store/index.js')
    expect(mod.LockResult).toBeUndefined()
    expect(mod.LockInfo).toBeUndefined()
  })

  it('exports AgentStatus and AgentInfo types', async () => {
    const mod = await import('../core/store/index.js')
    expect(mod.AgentStatus).toBeUndefined()
    expect(mod.AgentInfo).toBeUndefined()
  })

  it('exports GraphSnapshot and SnapshotCacheStats types', async () => {
    const mod = await import('../core/store/index.js')
    expect(mod.GraphSnapshot).toBeUndefined()
    expect(mod.SnapshotCacheStats).toBeUndefined()
  })

  it('exports StoreMode, ResolvedStore, ResolveOptions types', async () => {
    const mod = await import('../core/store/index.js')
    expect(mod.StoreMode).toBeUndefined()
    expect(mod.ResolvedStore).toBeUndefined()
    expect(mod.ResolveOptions).toBeUndefined()
  })
})
