/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// node_c6032372e1f2 — entrypoint do 2º binário `ant-swarming` (walking skeleton).
// Instalável separado do agf mas no MESMO repo, reusando 100% do core. O
// contrato do entrypoint: `--version` emite o envelope-padrão {ok,data,meta} e
// a camada NUNCA importa de src/cli ou src/tui (isolamento — épico node_071dacc4a425).

const SWARM = 'npx tsx src/swarming/index.ts'
const TIMEOUT = 20000

function pkgVersion(): string {
  return (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version
}

describe('ant-swarming entrypoint', () => {
  it('AC1: `--version` emite envelope {ok:true} com a versão exata do package.json', () => {
    const out = execSync(`${SWARM} --version`, { timeout: TIMEOUT }).toString()
    const json = JSON.parse(out) as { ok: boolean; data?: { version?: string } }
    expect(json.ok).toBe(true)
    expect(json.data?.version).toBe(pkgVersion())
  })

  it('AC2: package.json.bin contém a chave `ant-swarming` e o entrypoint-fonte existe', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { bin: Record<string, string> }
    expect(pkg.bin['ant-swarming']).toBeTruthy()
    expect(typeof pkg.bin['ant-swarming']).toBe('string')
    expect(existsSync('src/swarming/index.ts')).toBe(true)
  })

  it('AC3: src/swarming não importa de ../cli nem ../tui (isolamento de camada)', () => {
    const dir = 'src/swarming'
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts'))
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) {
      const src = readFileSync(join(dir, f), 'utf8')
      expect(src, `${f} não deve importar de ../cli`).not.toMatch(/from ['"]\.\.\/cli/)
      expect(src, `${f} não deve importar de ../tui`).not.toMatch(/from ['"]\.\.\/tui/)
    }
  })
})
