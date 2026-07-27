import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveModelAdapter } from '../core/model-hub/resolve-adapter.js'
import { saveAuth } from '../core/model-hub/copilot-auth.js'
import { CopilotApiAdapter } from '../core/model-hub/copilot-api-adapter.js'
import { CopilotSdkAdapter } from '../core/model-hub/copilot-sdk-adapter.js'

describe('resolveModelAdapter — auto: HTTP se logado, senão CLI (M1u)', () => {
  let dir: string
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), 'agf-resolve-'))))
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('sem login → adapter via-CLI', () => {
    const r = resolveModelAdapter({ authFilePath: join(dir, 'nao-existe.json') })
    expect(r.kind).toBe('cli')
    expect(r.adapter).toBeInstanceOf(CopilotSdkAdapter)
  })

  it('com login (githubToken salvo) → adapter HTTP', () => {
    const authFile = join(dir, 'auth.json')
    saveAuth(authFile, { githubToken: 'ghu_xxx' })
    const r = resolveModelAdapter({ authFilePath: authFile })
    expect(r.kind).toBe('api')
    expect(r.adapter).toBeInstanceOf(CopilotApiAdapter)
  })
})
