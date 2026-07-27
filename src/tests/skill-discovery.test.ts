import { describe, it, expect, beforeEach } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'

async function importDiscovery() {
  return await import('../core/skills/skill-discovery.js')
}

async function importBridge() {
  return await import('../tui/browser-port.js')
}

describe('SkillDiscovery — domain tier', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store
      .getDb()
      .prepare(
        `INSERT INTO projects (id, name, created_at, updated_at)
                           VALUES ('test-proj', 'test', datetime('now'), datetime('now'))`,
      )
      .run()
  })

  afterEach(() => {
    store.close()
  })

  it('storeDomainSkill e getDomainSkill funcionam', async () => {
    const { storeDomainSkill, getDomainSkill } = await importDiscovery()
    storeDomainSkill(store, 'github.com', 'shadow-dom', '{"selectors":".file-body"}')
    const result = getDomainSkill(store, 'github.com', 'shadow-dom')
    expect(result).not.toBeNull()
    expect(result!.pattern).toBe('{"selectors":".file-body"}')
  })

  it('listDomainSkills retorna skills por dominio', async () => {
    const { storeDomainSkill, listDomainSkills } = await importDiscovery()
    storeDomainSkill(store, 'github.com', 'shadow-dom', 'pattern-a')
    storeDomainSkill(store, 'github.com', 'dropdown', 'pattern-b')
    storeDomainSkill(store, 'amazon.com', 'dialog', 'pattern-c')

    const github = listDomainSkills(store, 'github.com')
    expect(github).toHaveLength(2)
    expect(github.map((s) => s.skillName)).toContain('shadow-dom')
    expect(github.map((s) => s.skillName)).toContain('dropdown')

    const amazon = listDomainSkills(store, 'amazon.com')
    expect(amazon).toHaveLength(1)
  })

  it('listDomainSkills sem dominio retorna todos', async () => {
    const { storeDomainSkill, listDomainSkills } = await importDiscovery()
    storeDomainSkill(store, 'github.com', 'shadow-dom', 'p1')
    storeDomainSkill(store, 'amazon.com', 'dialog', 'p2')

    const all = listDomainSkills(store)
    expect(all).toHaveLength(2)
  })
})

describe('SkillDiscovery — interaction tier', () => {
  it('detecta shadow DOM no HTML', async () => {
    const { analyzeInteractionSignals } = await importDiscovery()
    const html = '<div><shadow-element></shadow-element></div>'
    const signals = analyzeInteractionSignals(html)
    expect(signals.interaction).toContain('shadow-dom')
  })

  it('detecta iframes', async () => {
    const { analyzeInteractionSignals } = await importDiscovery()
    const html = '<div><iframe src="https://other.com"></iframe></div>'
    const signals = analyzeInteractionSignals(html)
    expect(signals.interaction).toContain('iframes')
  })

  it('detecta selects/dropdowns', async () => {
    const { analyzeInteractionSignals } = await importDiscovery()
    const html = '<select><option>A</option></select>'
    const signals = analyzeInteractionSignals(html)
    expect(signals.interaction).toContain('dropdowns')
  })

  it('detecta dialogs (alert/confirm)', async () => {
    const { analyzeInteractionSignals } = await importDiscovery()
    const html = '<html><body><script>alert("hi")</script></body></html>'
    const signals = analyzeInteractionSignals(html)
    expect(signals.interaction).toContain('dialogs')
  })

  it('detecta formularios com file input', async () => {
    const { analyzeInteractionSignals } = await importDiscovery()
    const html = '<input type="file" />'
    const signals = analyzeInteractionSignals(html)
    expect(signals.interaction).toContain('uploads')
  })

  it('vazio retorna sinais vazios', async () => {
    const { analyzeInteractionSignals } = await importDiscovery()
    const signals = analyzeInteractionSignals('')
    expect(signals.interaction).toHaveLength(0)
  })
})

describe('SkillDiscovery — 3-tier resolve', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store
      .getDb()
      .prepare(
        `INSERT INTO projects (id, name, created_at, updated_at)
                           VALUES ('test-proj', 'test', datetime('now'), datetime('now'))`,
      )
      .run()
  })

  afterEach(() => {
    store.close()
  })

  it('resolve prefere domain sobre workspace', async () => {
    const { createDiscoveryEngine, storeDomainSkill } = await importDiscovery()
    storeDomainSkill(store, 'example.com', 'shadow-dom', 'custom-selector')
    const engine = createDiscoveryEngine(store, '/tmp/nonexistent')
    const result = engine.resolve('https://example.com/page', '<div>no shadow</div>')
    expect(result.domainSkills).toHaveLength(1)
    expect(result.domainSkills[0].pattern).toBe('custom-selector')
  })

  it('interaction tier detecta do HTML', async () => {
    const { createDiscoveryEngine } = await importDiscovery()
    const engine = createDiscoveryEngine(store, '/tmp/nonexistent')
    const result = engine.resolve('https://unknown-site.com/page', '<select><option>X</option></select>')
    expect(result.interactionSignals).toContain('dropdowns')
    expect(result.domainSkills).toHaveLength(0)
  })

  it('resolve combina tiers', async () => {
    const { createDiscoveryEngine, storeDomainSkill } = await importDiscovery()
    storeDomainSkill(store, 'mix.com', 'dialog', 'confirm-handler')
    const engine = createDiscoveryEngine(store, '/tmp/nonexistent')
    const html = '<iframe src="x"></iframe><select><option>1</option></select>'
    const result = engine.resolve('https://mix.com/page', html)
    expect(result.domainSkills).toHaveLength(1)
    expect(result.interactionSignals).toContain('iframes')
    expect(result.interactionSignals).toContain('dropdowns')
  })
})
