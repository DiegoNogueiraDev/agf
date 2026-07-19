/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/skill-cmd.ts — skillCommand factory wiring.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { skillCommand } from '../cli/commands/skill-cmd.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import type { GraphNode } from '../core/graph/graph-types.js'

describe('skillCommand', () => {
  it('builds the "skill" command with a description', () => {
    const cmd = skillCommand()
    expect(cmd.name()).toBe('skill')
    expect(cmd.description().length).toBeGreaterThan(0)
  })
  it('wires 8 subcommands (list, show, new, propose, create, enable, disable, discover)', () => {
    expect(skillCommand().commands.length).toBe(8)
  })
})

describe('agf skill discover (node_wire_b130985dc8bf — skill-discovery wire)', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  async function run(args: string[]): Promise<Record<string, unknown>> {
    const out: string[] = []
    const spy = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: unknown) => {
      out.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    try {
      await skillCommand().parseAsync(args, { from: 'user' })
    } finally {
      process.stdout.write = spy
    }
    return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
  }

  it('resolves interaction signals from an HTML file and domain skills from the store', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-skill-discover-'))
    const store = SqliteStore.open(dir)
    store.initProject('skill-discover-test')
    const { storeDomainSkill } = await import('../core/skills/skill-discovery.js')
    storeDomainSkill(store, 'example.com', 'dropdown-pattern', '{"selector":"select.menu"}')
    store.close()

    const htmlPath = join(dir, 'page.html')
    writeFileSync(htmlPath, '<select><option>A</option></select>', 'utf8')

    const result = await run(['discover', 'https://example.com/page', '--html-file', htmlPath, '-d', dir])
    expect(result.ok).toBe(true)
    const data = result.data as {
      domainSkills: Array<{ skillName: string }>
      interactionSignals: string[]
    }
    expect(data.domainSkills.map((s) => s.skillName)).toContain('dropdown-pattern')
    expect(data.interactionSignals).toContain('dropdowns')
  })

  it('errors cleanly when --html-file does not exist', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-skill-discover-missing-'))
    const store = SqliteStore.open(dir)
    store.initProject('skill-discover-missing-test')
    store.close()

    const result = await run(['discover', 'https://example.com', '--html-file', join(dir, 'nope.html'), '-d', dir])
    expect(result.ok).toBe(false)
  })
})

describe('agf skill propose (node_wire_73c00d2d150f — auto-skill-proposer wire)', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  async function run(args: string[]): Promise<Record<string, unknown>> {
    const out: string[] = []
    const spy = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: unknown) => {
      out.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    try {
      await skillCommand().parseAsync(args, { from: 'user' })
    } finally {
      process.stdout.write = spy
    }
    return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
  }

  it('generates a draft skill from a real done task and writes it under skill-drafts/', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-skill-propose-'))
    const store = SqliteStore.open(dir)
    store.initProject('skill-propose-test')
    const now = new Date().toISOString()
    store.insertNode({
      id: 'task-sqlite-perf',
      type: 'task',
      title: 'Optimize sqlite query with better-sqlite3 prepared statements',
      description: 'Rewrote the hot-path query using better-sqlite3 prepared statements to cut latency.',
      status: 'done',
      priority: 2,
      createdAt: now,
      updatedAt: now,
    } as GraphNode)
    store.close()

    const result = await run([
      'propose',
      'task-sqlite-perf',
      '-d',
      dir,
      '--summary',
      'Prepared statements cut p99 latency by 40%',
      '--reason',
      'reused across 3 hot paths',
    ])
    expect(result.ok).toBe(true)
    const data = result.data as { domain: string; confidence: number; draftPath: string }
    expect(data.domain).toBe('sqlite-perf')
    expect(existsSync(data.draftPath)).toBe(true)
    const written = readFileSync(data.draftPath, 'utf8')
    expect(written).toContain('Prepared statements cut p99 latency by 40%')
    expect(written).toContain('status: draft')
  })

  it('errors when the task does not exist', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-skill-propose-missing-'))
    const store = SqliteStore.open(dir)
    store.initProject('skill-propose-missing-test')
    store.close()

    const result = await run(['propose', 'nope', '-d', dir, '--summary', 'x'])
    expect(result.ok).toBe(false)
  })
})

describe('agf skill list --built-in (node_wire_be4d752719a9 — built-in-skills wire)', () => {
  async function run(args: string[]): Promise<Record<string, unknown>> {
    const out: string[] = []
    const spy = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: unknown) => {
      out.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    try {
      await skillCommand().parseAsync(args, { from: 'user' })
    } finally {
      process.stdout.write = spy
    }
    return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
  }

  it('without --built-in, only filesystem skills are listed (default unchanged)', async () => {
    const result = await run(['list', '-d', mkdtempSync(join(tmpdir(), 'agf-skill-list-'))])
    expect(result.ok).toBe(true)
    const data = result.data as { skills: Array<{ name: string }> }
    expect(data.skills.some((s) => s.name === 'create-prd-chat-mode')).toBe(false)
  })

  it('with --built-in, the 54 code-defined skills are included', async () => {
    const result = await run(['list', '--built-in', '-d', mkdtempSync(join(tmpdir(), 'agf-skill-list-bi-'))])
    expect(result.ok).toBe(true)
    const data = result.data as { skills: Array<{ name: string; category: string }> }
    expect(data.skills.some((s) => s.name === 'create-prd-chat-mode')).toBe(true)
    expect(data.skills.length).toBeGreaterThanOrEqual(54)
  })

  it('--built-in respects --phase filtering via getSkillsByPhase', async () => {
    const resultAll = await run(['list', '--built-in', '-d', mkdtempSync(join(tmpdir(), 'agf-skill-list-all-'))])
    const resultPhase = await run([
      'list',
      '--built-in',
      '--phase',
      'ANALYZE',
      '-d',
      mkdtempSync(join(tmpdir(), 'agf-skill-list-phase-')),
    ])
    expect(resultPhase.ok).toBe(true)
    const dataAll = resultAll.data as { skills: unknown[] }
    const dataPhase = resultPhase.data as { skills: unknown[] }
    // filtering to one phase must narrow the result vs. the unfiltered set
    expect(dataPhase.skills.length).toBeGreaterThan(0)
    expect(dataPhase.skills.length).toBeLessThan(dataAll.skills.length)
  })
})

describe('agf skill new — name validation (node_wire_8416c7ac5606 — skill-scaffolder wire)', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  async function run(args: string[]): Promise<Record<string, unknown>> {
    const out: string[] = []
    const spy = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: unknown) => {
      out.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    try {
      await skillCommand().parseAsync(args, { from: 'user' })
    } finally {
      process.stdout.write = spy
    }
    return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
  }

  it('a valid kebab-case name still scaffolds correctly (regression)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-skill-new-valid-'))
    const result = await run(['new', 'my-valid-skill', '-d', dir])
    expect(result.ok).toBe(true)
    expect(existsSync(join(dir, 'my-valid-skill', 'SKILL.md'))).toBe(true)
  })

  it('rejects a name with spaces using the dormant isValidSkillName regex', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-skill-new-invalid-'))
    const result = await run(['new', 'not a valid name', '-d', dir])
    expect(result.ok).toBe(false)
    expect(existsSync(join(dir, 'not a valid name'))).toBe(false)
  })

  it('rejects an uppercase name', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-skill-new-upper-'))
    const result = await run(['new', 'NotKebabCase', '-d', dir])
    expect(result.ok).toBe(false)
  })
})

describe('agf skill create/enable/disable (node_wire_70f399c63ad9 — skill-store wire)', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  async function run(args: string[]): Promise<Record<string, unknown>> {
    const out: string[] = []
    const spy = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: unknown) => {
      out.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    try {
      await skillCommand().parseAsync(args, { from: 'user' })
    } finally {
      process.stdout.write = spy
    }
    return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
  }

  it('creates a real custom skill persisted to the project SQLite store', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-skill-create-'))
    const store = SqliteStore.open(dir)
    store.initProject('skill-create-test')
    store.close()

    const result = await run([
      'create',
      '--name',
      'my-custom-skill',
      '--description',
      'Handles X',
      '--phase',
      'IMPLEMENT',
      '--instructions',
      'Do the thing carefully.',
      '-d',
      dir,
    ])
    expect(result.ok).toBe(true)
    const data = result.data as { id: string; name: string }
    expect(data.name).toBe('my-custom-skill')

    const verify = SqliteStore.open(dir)
    const project = verify.getActiveProject()!
    const row = verify
      .getDb()
      .prepare('SELECT * FROM custom_skills WHERE project_id = ? AND name = ?')
      .get(project.id, 'my-custom-skill')
    verify.close()
    expect(row).toBeDefined()
  })

  it('creating a duplicate name fails cleanly', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-skill-create-dup-'))
    const store = SqliteStore.open(dir)
    store.initProject('skill-create-dup-test')
    store.close()

    const args = [
      'create',
      '--name',
      'dup-skill',
      '--description',
      'x',
      '--phase',
      'IMPLEMENT',
      '--instructions',
      'y',
      '-d',
      dir,
    ]
    const first = await run(args)
    expect(first.ok).toBe(true)
    const second = await run(args)
    expect(second.ok).toBe(false)
  })

  it('enable/disable toggles a real persisted preference', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-skill-toggle-'))
    const store = SqliteStore.open(dir)
    store.initProject('skill-toggle-test')
    store.close()

    const disableResult = await run(['disable', 'some-skill', '-d', dir])
    expect(disableResult.ok).toBe(true)

    const verify = SqliteStore.open(dir)
    const project = verify.getActiveProject()!
    const row = verify
      .getDb()
      .prepare('SELECT enabled FROM skill_preferences WHERE project_id = ? AND skill_name = ?')
      .get(project.id, 'some-skill') as { enabled: number } | undefined
    verify.close()
    expect(row?.enabled).toBe(0)

    const enableResult = await run(['enable', 'some-skill', '-d', dir])
    expect(enableResult.ok).toBe(true)

    const verify2 = SqliteStore.open(dir)
    const row2 = verify2
      .getDb()
      .prepare('SELECT enabled FROM skill_preferences WHERE project_id = ? AND skill_name = ?')
      .get(project.id, 'some-skill') as { enabled: number } | undefined
    verify2.close()
    expect(row2?.enabled).toBe(1)
  })
})

describe('agf skill propose --auto (node_wire_a56eac7c1f8b — trajectory-analyzer wire)', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  async function run(args: string[]): Promise<Record<string, unknown>> {
    const out: string[] = []
    const spy = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: unknown) => {
      out.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    try {
      await skillCommand().parseAsync(args, { from: 'user' })
    } finally {
      process.stdout.write = spy
    }
    return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
  }

  it('--auto computes real reasons from cycle-time divergence (retries) without --reason flags', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-skill-auto-'))
    const store = SqliteStore.open(dir)
    store.initProject('skill-auto-test')
    const projectId = store.getActiveProject()!.id
    const now2 = new Date().toISOString()
    store.insertNode({
      id: 'task-slow',
      type: 'task',
      title: 'Fix the flaky test',
      description: 'Took much longer than expected due to retries.',
      status: 'done',
      priority: 2,
      xpSize: 'S',
      createdAt: now2,
      updatedAt: now2,
    } as GraphNode)
    const db = store.getDb()
    db.prepare(
      `INSERT INTO node_changelog (project_id, node_id, field, new_value, changed_at) VALUES (?, ?, 'status', 'in_progress', ?)`,
    ).run(projectId, 'task-slow', '2026-01-01T00:00:00Z')
    db.prepare(
      `INSERT INTO node_changelog (project_id, node_id, field, new_value, changed_at) VALUES (?, ?, 'status', 'done', ?)`,
    ).run(projectId, 'task-slow', '2026-01-01T03:00:00Z')
    store.close()

    const result = await run(['propose', 'task-slow', '-d', dir, '--auto'])
    expect(result.ok).toBe(true)
    const data = result.data as { draftPath: string }
    const written = readFileSync(data.draftPath, 'utf8')
    expect(written).toContain('retries')
  })

  it('--auto with no interesting signal reports shouldPropose:false and writes no draft', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-skill-auto-boring-'))
    const store = SqliteStore.open(dir)
    store.initProject('skill-auto-boring-test')
    const now3 = new Date().toISOString()
    store.insertNode({
      id: 'task-boring',
      type: 'task',
      title: 'Update the changelog',
      description: 'Routine update.',
      status: 'done',
      priority: 3,
      xpSize: 'S',
      createdAt: now3,
      updatedAt: now3,
    } as GraphNode)
    store.close()

    const result = await run(['propose', 'task-boring', '-d', dir, '--auto'])
    expect(result.ok).toBe(true)
    const data = result.data as { shouldPropose: boolean; draftPath?: string }
    expect(data.shouldPropose).toBe(false)
    expect(data.draftPath).toBeUndefined()
  })
})
