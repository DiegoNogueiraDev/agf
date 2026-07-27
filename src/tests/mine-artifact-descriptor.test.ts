/*!
 * TDD: mine-on-done artifact loop (node_9982d97af4dc).
 *
 * AC1: After done with a new file, scaffold corpus gains a descriptor.
 * AC2: Subsequent build with similar goal finds the mined descriptor.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { mkdirSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mineArtifactDescriptor, loadMinedDescriptors, type ArtifactDescriptor } from '../core/rag-out/mine-on-done.js'

const TEST_DIR = join(tmpdir(), `mine-artifact-test-${process.pid}`)

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
})

function makeDir(): string {
  mkdirSync(join(TEST_DIR, 'workflow-graph', 'memories'), { recursive: true })
  return TEST_DIR
}

describe('AC1: scaffold corpus gains descriptor after done', () => {
  it('mineArtifactDescriptor persists a descriptor for a new artifact', () => {
    const dir = makeDir()
    mineArtifactDescriptor(
      ['src/core/scan/repo-dedupe.ts', 'src/tests/repo-dedupe.test.ts'],
      'simhash monorepo deduplication',
      dir,
    )
    const descriptors = loadMinedDescriptors(dir)
    expect(descriptors.length).toBeGreaterThan(0)
    expect(descriptors[0]!.goal).toContain('simhash')
  })

  it('calling twice with same goal merges (no duplicates)', () => {
    const dir = makeDir()
    mineArtifactDescriptor(['src/core/scan/repo-dedupe.ts'], 'simhash monorepo deduplication', dir)
    mineArtifactDescriptor(['src/core/scan/repo-dedupe-v2.ts'], 'simhash monorepo deduplication', dir)
    const descriptors = loadMinedDescriptors(dir)
    const matching = descriptors.filter((d: ArtifactDescriptor) => d.goal.includes('simhash'))
    expect(matching.length).toBe(1)
  })

  it('descriptor includes file paths', () => {
    const dir = makeDir()
    mineArtifactDescriptor(['src/core/scan/repo-dedupe.ts'], 'repo deduplication', dir)
    const descriptors = loadMinedDescriptors(dir)
    expect(descriptors[0]!.files.length).toBeGreaterThan(0)
  })
})

describe('AC2: loop closed — mined descriptor round-trips', () => {
  it('loadMinedDescriptors returns [] when nothing mined yet', () => {
    const dir = makeDir()
    expect(loadMinedDescriptors(dir)).toEqual([])
  })

  it('mined descriptor found on subsequent load', () => {
    const dir = makeDir()
    mineArtifactDescriptor(['src/core/llm/gateway.ts'], 'llm gateway provider', dir)
    const found = loadMinedDescriptors(dir).some((d: ArtifactDescriptor) => d.goal.includes('llm gateway'))
    expect(found).toBe(true)
  })
})
