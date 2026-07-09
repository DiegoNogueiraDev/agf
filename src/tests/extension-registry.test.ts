import { describe, it, expect, vi } from 'vitest'
import { ExtensionRegistryBuilder } from '../core/plugins/extension-registry.js'
import type {
  ToolContributor,
  ContextContributor,
  ApprovalReviewContributor,
  TurnLifecycleContributor,
} from '../schemas/extension-lifecycle.schema.js'

describe('ExtensionRegistryBuilder', () => {
  it('should register ToolContributors', () => {
    const builder = new ExtensionRegistryBuilder()
    const mock: ToolContributor = { tools: vi.fn().mockReturnValue([]) }
    builder.addToolContributor(mock)
    const registry = builder.build()
    expect(registry.toolContributors()).toHaveLength(1)
  })

  it('should register ContextContributors', () => {
    const builder = new ExtensionRegistryBuilder()
    const mock: ContextContributor = { contribute: vi.fn().mockReturnValue([]) }
    builder.addContextContributor(mock)
    const registry = builder.build()
    expect(registry.contextContributors()).toHaveLength(1)
  })

  it('should register ApprovalReviewContributors', () => {
    const builder = new ExtensionRegistryBuilder()
    const mock: ApprovalReviewContributor = { contribute: vi.fn().mockReturnValue(undefined) }
    builder.addApprovalReviewContributor(mock)
    const registry = builder.build()
    expect(registry.approvalReviewContributors()).toHaveLength(1)
  })

  it('should register TurnLifecycleContributors', () => {
    const builder = new ExtensionRegistryBuilder()
    const mock: TurnLifecycleContributor = {
      onTurnStart: vi.fn(),
      onTurnStop: vi.fn(),
      onTurnAbort: vi.fn(),
      onTurnError: vi.fn(),
    }
    builder.addTurnLifecycleContributor(mock)
    const registry = builder.build()
    expect(registry.turnLifecycleContributors()).toHaveLength(1)
  })

  it('should freeze after build()', () => {
    const builder = new ExtensionRegistryBuilder()
    builder.addToolContributor({ tools: vi.fn().mockReturnValue([]) })
    const registry = builder.build()
    expect(() => {
      ;(registry as any).toolContributors().push({ tools: vi.fn() })
    }).toThrow()
  })

  it('should maintain registration order', () => {
    const builder = new ExtensionRegistryBuilder()
    const first: ContextContributor = {
      contribute: vi.fn().mockReturnValue([{ slot: 'DeveloperPolicy' as any, text: 'first', priority: 50 }]),
    }
    const second: ContextContributor = {
      contribute: vi.fn().mockReturnValue([{ slot: 'DeveloperPolicy' as any, text: 'second', priority: 50 }]),
    }
    builder.addContextContributor(first)
    builder.addContextContributor(second)
    const registry = builder.build()
    expect(registry.contextContributors()).toHaveLength(2)
    expect(registry.contextContributors()[0]).toBe(first)
    expect(registry.contextContributors()[1]).toBe(second)
  })

  it('should combine all contributor types', () => {
    const builder = new ExtensionRegistryBuilder()
    builder.addToolContributor({ tools: vi.fn().mockReturnValue([]) })
    builder.addContextContributor({ contribute: vi.fn().mockReturnValue([]) })
    builder.addApprovalReviewContributor({ contribute: vi.fn().mockReturnValue(undefined) })
    builder.addTurnLifecycleContributor({
      onTurnStart: vi.fn(),
      onTurnStop: vi.fn(),
      onTurnAbort: vi.fn(),
      onTurnError: vi.fn(),
    })

    const registry = builder.build()
    expect(registry.toolContributors()).toHaveLength(1)
    expect(registry.contextContributors()).toHaveLength(1)
    expect(registry.approvalReviewContributors()).toHaveLength(1)
    expect(registry.turnLifecycleContributors()).toHaveLength(1)
  })
})
