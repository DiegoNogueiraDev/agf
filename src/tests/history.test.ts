import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { saveHistory, loadHistory } from '../tui/history.js'

describe('history persistence', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'history-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('saveHistory escreve array como JSON', () => {
    const path = join(tmpDir, 'history.json')
    saveHistory(['/help', '/next', '/run'], path)
    expect(existsSync(path)).toBe(true)
    const raw = JSON.parse(readFileSync(path, 'utf8'))
    expect(raw).toEqual(['/help', '/next', '/run'])
  })

  it('saveHistory preserva ordem (mais antigo primeiro)', () => {
    const path = join(tmpDir, 'history.json')
    saveHistory(['a', 'b', 'c'], path)
    const raw = JSON.parse(readFileSync(path, 'utf8'))
    expect(raw[0]).toBe('a')
    expect(raw[raw.length - 1]).toBe('c')
  })

  it('loadHistory carrega JSON previamente salvo', () => {
    const path = join(tmpDir, 'history.json')
    writeFileSync(path, JSON.stringify(['/next', '/run']), 'utf8')
    const loaded = loadHistory(path)
    expect(loaded).toEqual(['/next', '/run'])
  })

  it('loadHistory retorna array vazio se arquivo não existe', () => {
    const path = join(tmpDir, 'nonexistent.json')
    const loaded = loadHistory(path)
    expect(loaded).toEqual([])
  })

  it('loadHistory retorna array vazio se JSON é inválido', () => {
    const path = join(tmpDir, 'corrupt.json')
    writeFileSync(path, 'not json', 'utf8')
    const loaded = loadHistory(path)
    expect(loaded).toEqual([])
  })

  it('saveHistory sobrescreve arquivo existente', () => {
    const path = join(tmpDir, 'history.json')
    writeFileSync(path, JSON.stringify(['old']), 'utf8')
    saveHistory(['/new'], path)
    const loaded = loadHistory(path)
    expect(loaded).toEqual(['/new'])
  })
})
