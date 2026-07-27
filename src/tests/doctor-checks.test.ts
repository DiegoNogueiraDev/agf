import { describe, it, expect, afterEach } from 'vitest'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stampBody } from '../core/config/boundary-drift.js'
import {
  checkNodeVersionWith,
  checkNativeBinaryHealthWith,
  checkMemoryHealth,
  checkAgentsMdCascadeWith,
  checkBoundaryDriftWith,
  checkHasSourceFiles,
  checkUpdateCheckStatus,
} from '../core/doctor/doctor-checks.js'
import type { MemorySnapshot } from '../core/observability/heap-telemetry.js'

const req = createRequire(import.meta.url)
const thisFile = fileURLToPath(import.meta.url)

/** In-memory fs stub shared by every check that takes an injected fs port. */
function fakeFs(files: Record<string, string>): { exists: (p: string) => boolean; read: (p: string) => string } {
  return { exists: (p) => p in files, read: (p) => files[p] }
}

describe('checkNodeVersionWith', () => {
  it('returns ok for Node 20', () => {
    const result = checkNodeVersionWith('20.0.0')
    expect(result.level).toBe('ok')
  })

  it('returns ok for Node 22', () => {
    const result = checkNodeVersionWith('22.1.0')
    expect(result.level).toBe('ok')
  })

  it('returns error for Node 18 (below minimum)', () => {
    const result = checkNodeVersionWith('18.0.0')
    expect(result.level).toBe('error')
  })

  it('returns error for Node 14', () => {
    const result = checkNodeVersionWith('14.0.0')
    expect(result.level).toBe('error')
  })

  it('includes version in the message', () => {
    const result = checkNodeVersionWith('20.5.1')
    expect(result.message).toContain('20.5.1')
  })

  it('error result includes suggestion', () => {
    const result = checkNodeVersionWith('16.0.0')
    expect(result.suggestion).toBeTruthy()
  })

  it('result name is node-version', () => {
    expect(checkNodeVersionWith('20.0.0').name).toBe('node-version')
    expect(checkNodeVersionWith('16.0.0').name).toBe('node-version')
  })
})

describe('node_b7b4639a4655: checkNativeBinaryHealthWith wires checkNativeBinary into agf doctor', () => {
  it('is ok and skips the check entirely under Bun (bun:sqlite has no native .node)', () => {
    const result = checkNativeBinaryHealthWith({
      isBun: true,
      resolveBinaryPath: () => {
        throw new Error('should never be called under Bun')
      },
    })
    expect(result.level).toBe('ok')
    expect(result.name).toBe('native-binary-health')
  })

  it('is ok when the resolved binary passes checkNativeBinary (valid magic bytes)', () => {
    const result = checkNativeBinaryHealthWith({
      isBun: false,
      resolveBinaryPath: () => req.resolve('better-sqlite3/build/Release/better_sqlite3.node'),
    })
    expect(result.level).toBe('ok')
  })

  it('is error with an actionable suggestion when the binary fails the magic-bytes check', () => {
    const result = checkNativeBinaryHealthWith({
      isBun: false,
      resolveBinaryPath: () => thisFile, // a real file, but not a native binary — deterministic non-match
    })
    expect(result.level).toBe('error')
    expect(result.suggestion).toContain('npm rebuild better-sqlite3')
  })

  it('is a warning (not a hard crash) when the binary path cannot be resolved at all', () => {
    const result = checkNativeBinaryHealthWith({
      isBun: false,
      resolveBinaryPath: () => {
        throw new Error('Cannot find module')
      },
    })
    expect(result.level).toBe('warning')
  })
})

describe('checkMcpBridgeHealth (node_wire_2acf4c9f7725 — direct-mcp-provider wire)', () => {
  it('is ok when the DirectMcpProvider connects in simulate mode', async () => {
    const { checkMcpBridgeHealth } = await import('../core/doctor/doctor-checks.js')
    const result = await checkMcpBridgeHealth()
    expect(result.level).toBe('ok')
    expect(result.name).toBe('mcp-bridge')
  })

  it('message reports the DirectMCP label and version', async () => {
    const { checkMcpBridgeHealth } = await import('../core/doctor/doctor-checks.js')
    const result = await checkMcpBridgeHealth()
    expect(result.message).toContain('DirectMCP')
  })

  it('is a warning when the injected provider factory fails to connect', async () => {
    const { checkMcpBridgeHealthWith } = await import('../core/doctor/doctor-checks.js')
    const result = await checkMcpBridgeHealthWith(() => ({
      id: 'mcp-graph',
      label: 'DirectMCP',
      start: async () => ({ connected: false, storeReady: false, nodeCount: 0, version: '0.0.0', uptimeMs: 0 }),
      stop: async () => {},
      status: () => ({ connected: false, storeReady: false, nodeCount: 0, version: '0.0.0', uptimeMs: 0 }),
    }))
    expect(result.level).toBe('warning')
  })
})

describe('checkSentruxHealthSafe (node_wire_604e4aeb53d0 — sentrux-adapter wire)', () => {
  it('is ok and reports the version when sentrux is detected', async () => {
    const { checkSentruxHealthSafeWith } = await import('../core/doctor/doctor-checks-sentrux.js')
    const result = await checkSentruxHealthSafeWith(async () => ({ available: true, version: '1.2.3' }))
    expect(result.level).toBe('ok')
    expect(result.name).toBe('sentrux-health')
    expect(result.message).toContain('1.2.3')
  })

  it('is a warning with the install hint when sentrux is absent', async () => {
    const { checkSentruxHealthSafeWith } = await import('../core/doctor/doctor-checks-sentrux.js')
    const result = await checkSentruxHealthSafeWith(async () => ({
      available: false,
      hint: 'brew install sentrux/tap/sentrux',
    }))
    expect(result.level).toBe('warning')
    expect(result.suggestion).toBe('brew install sentrux/tap/sentrux')
  })

  it('checkSentruxHealthSafe (production path) resolves without throwing', async () => {
    const { checkSentruxHealthSafe } = await import('../core/doctor/doctor-checks-sentrux.js')
    await expect(checkSentruxHealthSafe()).resolves.not.toThrow()
    const result = await checkSentruxHealthSafe()
    expect(result.name).toBe('sentrux-health')
  })
})

describe('checkMemoryHealth (node_wire_8eab72be5342 — heap-telemetry wire)', () => {
  function fakeSampler(snap: MemorySnapshot): () => MemorySnapshot {
    return () => snap
  }

  it('is ok when heap/rss/external are all within healthy bounds', () => {
    const result = checkMemoryHealth(fakeSampler({ heapMB: 100, externalMB: 10, rssMB: 200, ts: 0 }))
    expect(result.level).toBe('ok')
    expect(result.message).toContain('memory healthy')
  })

  it('is a warning with an actionable suggestion when heap exceeds 500MB', () => {
    const result = checkMemoryHealth(fakeSampler({ heapMB: 600, externalMB: 10, rssMB: 200, ts: 0 }))
    expect(result.level).toBe('warning')
    expect(result.suggestion).toContain('heap > 500MB')
  })

  it('is a warning when RSS exceeds 1GB', () => {
    const result = checkMemoryHealth(fakeSampler({ heapMB: 100, externalMB: 10, rssMB: 1200, ts: 0 }))
    expect(result.level).toBe('warning')
    expect(result.suggestion).toContain('RSS > 1GB')
  })
})

describe('checkUpdateCheckStatus (node_wire_2177342825c0 — update-check wire)', () => {
  it('reports enabled when no opt-out is set', () => {
    const result = checkUpdateCheckStatus({})
    expect(result.name).toBe('update-check')
    expect(result.level).toBe('ok')
    expect(result.message).toContain('enabled')
  })

  it('reports disabled when MCP_GRAPH_NO_UPDATE_CHECK=1', () => {
    const result = checkUpdateCheckStatus({ MCP_GRAPH_NO_UPDATE_CHECK: '1' })
    expect(result.level).toBe('ok')
    expect(result.message).toContain('disabled')
  })

  it('reports disabled in CI', () => {
    const result = checkUpdateCheckStatus({ CI: 'true' })
    expect(result.message).toContain('disabled')
  })
})

describe('checkAgentsMdCascadeWith (node_wire_0b6ea0a14928 — agents-md-cascade wire)', () => {
  it('is ok and reports nothing to cascade when no AGENTS.md layer exists', () => {
    const result = checkAgentsMdCascadeWith(['/root/AGENTS.md'], fakeFs({}))
    expect(result.level).toBe('ok')
    expect(result.message).toContain('No AGENTS.md')
  })

  it('is ok and reports a single layer when only the root AGENTS.md exists', () => {
    const result = checkAgentsMdCascadeWith(['/root/AGENTS.md'], fakeFs({ '/root/AGENTS.md': '# Root' }))
    expect(result.level).toBe('ok')
    expect(result.message).toContain('Single AGENTS.md layer')
  })

  it('is ok and reports the cascade depth when root and subdir layers both exist', () => {
    const result = checkAgentsMdCascadeWith(
      ['/root/AGENTS.md', '/root/src/AGENTS.md'],
      fakeFs({ '/root/AGENTS.md': '# Root', '/root/src/AGENTS.md': '# Src' }),
    )
    expect(result.level).toBe('ok')
    expect(result.message).toContain('2 AGENTS.md layers')
  })

  it('result name is agents-md-cascade', () => {
    expect(checkAgentsMdCascadeWith(['/root/AGENTS.md'], fakeFs({})).name).toBe('agents-md-cascade')
  })
})

describe('checkBoundaryDriftWith (node_wire_bbe34ca50fde — boundary-drift wire)', () => {
  const wrap = (body: string) => `<!-- agent-graph-flow:start -->\n${body}\n<!-- agent-graph-flow:end -->`

  it('is ok when the managed file does not exist — nothing to check', () => {
    const result = checkBoundaryDriftWith('/root/CLAUDE.md', 'canonical body', fakeFs({}))
    expect(result.level).toBe('ok')
    expect(result.message).toContain('not found')
  })

  it('is ok when the managed section matches the canonical generated content', () => {
    const canonical = 'canonical body'
    const result = checkBoundaryDriftWith('/root/CLAUDE.md', canonical, fakeFs({ '/root/CLAUDE.md': wrap(canonical) }))
    expect(result.level).toBe('ok')
    expect(result.message).toContain('matches')
  })

  it('warns when the managed section was hand-edited (boundary drift)', () => {
    const canonical = 'canonical body text'
    // A hand edit is: we stamped the canonical body, THEN someone changed it — so
    // the content no longer hashes to the stamp. (Stamping the already-edited text
    // would be a body we legitimately generated, i.e. merely outdated.)
    const drifted = wrap(stampBody(canonical).replace('canonical', 'hand-edited'))
    const result = checkBoundaryDriftWith('/root/CLAUDE.md', canonical, fakeFs({ '/root/CLAUDE.md': drifted }))
    expect(result.level).toBe('warning')
    expect(result.message).toContain('hand-edited')
    expect(result.suggestion).toBeDefined()
  })

  it('result name is boundary-drift', () => {
    expect(checkBoundaryDriftWith('/root/CLAUDE.md', 'x', fakeFs({})).name).toBe('boundary-drift')
  })
})

describe('checkHasSourceFiles (node_wire_568aee08661a — source-files wire)', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('is ok when the directory has recognizable source files', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-doctor-src-'))
    writeFileSync(join(dir, 'index.ts'), 'export const x = 1')
    const result = await checkHasSourceFiles(dir)
    expect(result.level).toBe('ok')
  })

  it('warns when the directory has no recognizable source files', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-doctor-src-'))
    writeFileSync(join(dir, 'README.md'), '# empty project')
    const result = await checkHasSourceFiles(dir)
    expect(result.level).toBe('warning')
    expect(result.suggestion).toBeDefined()
  })

  it('result name is has-source-files', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-doctor-src-'))
    writeFileSync(join(dir, 'index.ts'), 'export const x = 1')
    const result = await checkHasSourceFiles(dir)
    expect(result.name).toBe('has-source-files')
  })
})

describe('checkBoundaryDriftWith — outdated is not tampering (node_91944b8b26a0)', () => {
  const OLD = ['# H', '', 'one', '', 'two'].join('\n')
  const NEW = ['# H', '', 'one', '', 'NEW BLOCK', '', 'two'].join('\n')
  const wrapM = (c: string) => `pre\n<!-- agent-graph-flow:start -->\n${c}\n<!-- agent-graph-flow:end -->\npost`

  it('does not accuse a hand-edit when the file is merely an older generated body', () => {
    const r = checkBoundaryDriftWith('/root/CLAUDE.md', NEW, fakeFs({ '/root/CLAUDE.md': wrapM(OLD) }))
    expect(r.message).not.toContain('hand-edited')
    expect(r.message).toContain('out of date')
    expect(r.suggestion?.toLowerCase()).toContain('regenerate')
  })

  it('still names a hand-edit as such', () => {
    const tampered = stampBody(NEW).replace('one', 'one — typed by a human')
    const r = checkBoundaryDriftWith('/root/CLAUDE.md', NEW, fakeFs({ '/root/CLAUDE.md': wrapM(tampered) }))
    expect(r.message).toContain('hand-edited')
  })

  it('says it cannot tell for a legacy file that predates stamping', () => {
    // Every file written before provenance existed lands here. Admitting the limit
    // beats accusing the user, and regenerating once makes the check exact.
    const legacy = ['# H', '', 'content the generator later dropped'].join('\n')
    const r = checkBoundaryDriftWith('/root/CLAUDE.md', NEW, fakeFs({ '/root/CLAUDE.md': wrapM(legacy) }))
    expect(r.message).not.toContain('hand-edited')
    expect(r.message).toContain('cannot tell')
  })
})
