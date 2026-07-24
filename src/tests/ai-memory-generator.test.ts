import { describe, it, expect } from 'vitest'
import {
  applySection,
  MARKER_START,
  MARKER_END,
  LEGACY_MARKER_START,
  LEGACY_MARKER_END,
  STRANDED_CONTRACT_HEADING,
  generateClaudeMdSection,
} from '../core/config/ai-memory-generator.js'
import { UNIVERSAL_RULES_HEADING, UNIVERSAL_RULES } from '../core/config/cli-reference-content.js'
import { generateContractSection } from '../core/output/consumer-contract.js'

const FULL_SECTION = `${MARKER_START}\ncontent here\n${MARKER_END}`

describe('constants', () => {
  it('MARKER_START contains agent-graph-flow', () => {
    expect(MARKER_START).toContain('agent-graph-flow')
    expect(MARKER_START).toContain('start')
  })

  it('MARKER_END contains agent-graph-flow', () => {
    expect(MARKER_END).toContain('agent-graph-flow')
    expect(MARKER_END).toContain('end')
  })

  it('LEGACY markers reference mcp-graph', () => {
    expect(LEGACY_MARKER_START).toContain('mcp-graph')
    expect(LEGACY_MARKER_END).toContain('mcp-graph')
  })
})

describe('applySection — insert into empty file', () => {
  it('inserts section into empty content', () => {
    const result = applySection('', FULL_SECTION)
    expect(result).toContain(MARKER_START)
    expect(result).toContain(MARKER_END)
    expect(result).toContain('content here')
  })

  it('appends section when existing content has no markers', () => {
    const result = applySection('# Existing\n\nSome content', FULL_SECTION)
    expect(result).toContain('# Existing')
    expect(result).toContain(MARKER_START)
  })
})

describe('applySection — replace existing marked section', () => {
  it('replaces existing section in-place', () => {
    const existing = `# Doc\n\n${MARKER_START}\nold content\n${MARKER_END}\n\n## After`
    const newSection = `${MARKER_START}\nnew content\n${MARKER_END}`
    const result = applySection(existing, newSection)
    expect(result).toContain('new content')
    expect(result).not.toContain('old content')
    expect(result).toContain('# Doc')
    expect(result).toContain('## After')
  })

  it('preserves content before and after markers', () => {
    const before = '# Title\n\nIntro paragraph.'
    const after = '## Appendix\n\nFooter text.'
    const existing = `${before}\n\n${MARKER_START}\nstale\n${MARKER_END}\n\n${after}`
    const result = applySection(existing, FULL_SECTION)
    expect(result).toContain('# Title')
    expect(result).toContain('## Appendix')
    expect(result).toContain('content here')
  })
})

describe('applySection — sweeps stranded contract duplication', () => {
  const contract = `${STRANDED_CONTRACT_HEADING}\n\nEvery agf command returns JSON.\n`

  it('collapses N trailing contract copies stranded after MARKER_END to zero', () => {
    const strays = Array.from({ length: 17 }, () => contract).join('\n')
    const existing = `# Doc\n\n${MARKER_START}\nold\n${MARKER_END}\n\n${strays}`
    const result = applySection(existing, FULL_SECTION)
    expect(result.match(new RegExp(STRANDED_CONTRACT_HEADING, 'g'))).toBeNull()
    expect(result).toContain('content here')
    expect(result).toContain('# Doc')
  })

  it('is idempotent — re-applying does not regrow the stranded section', () => {
    const existing = `${MARKER_START}\nold\n${MARKER_END}\n\n${contract}${contract}`
    const once = applySection(existing, FULL_SECTION)
    const twice = applySection(once, FULL_SECTION)
    expect(once).toBe(twice)
    expect((twice.match(new RegExp(STRANDED_CONTRACT_HEADING, 'g')) ?? []).length).toBe(0)
  })

  it('preserves legitimate non-contract content after MARKER_END', () => {
    const existing = `${MARKER_START}\nold\n${MARKER_END}\n\n## Real Appendix\n\nKeep me.\n\n${contract}`
    const result = applySection(existing, FULL_SECTION)
    expect(result).toContain('## Real Appendix')
    expect(result).toContain('Keep me.')
    expect(result).not.toContain(STRANDED_CONTRACT_HEADING)
  })
})

describe('applySection — idempotent re-init (never increments the block)', () => {
  it('re-applying the same section keeps exactly one marker pair (fixed point)', () => {
    const section = `${MARKER_START}\nmanaged block body\n${MARKER_END}`
    const once = applySection('# Project\n\nIntro.', section)
    const twice = applySection(once, section)
    const thrice = applySection(twice, section)

    expect(twice).toBe(once)
    expect(thrice).toBe(once)
    expect((once.match(new RegExp(MARKER_START, 'g')) ?? []).length).toBe(1)
    expect((once.match(new RegExp(MARKER_END, 'g')) ?? []).length).toBe(1)
  })
})

describe('STRANDED_CONTRACT_HEADING — drift guard', () => {
  // The self-heal sweep in applySection() keys on this exact heading string. If the
  // contract section ever renames its heading without updating the constant, the sweep
  // silently stops collapsing stranded duplication and the bloat-class regresses. Bind
  // the constant to the heading the generator actually emits so drift fails loudly here.
  it('matches the heading emitted by generateContractSection()', () => {
    const firstLine = generateContractSection().split('\n')[0]
    expect(firstLine).toBe(STRANDED_CONTRACT_HEADING)
  })

  it('sweeps a freshly generated contract section stranded after MARKER_END', () => {
    const realContract = generateContractSection()
    const existing = `# Doc\n\n${MARKER_START}\nold\n${MARKER_END}\n\n${realContract}\n\n${realContract}`
    const result = applySection(existing, FULL_SECTION)
    expect(result).not.toContain(STRANDED_CONTRACT_HEADING)
    expect(result).toContain('content here')
  })
})

describe('applySection — legacy marker migration', () => {
  it('strips legacy mcp-graph block before inserting new section', () => {
    const legacy = `Before\n\n${LEGACY_MARKER_START}\nlegacy stuff\n${LEGACY_MARKER_END}\n\nAfter`
    const result = applySection(legacy, FULL_SECTION)
    expect(result).not.toContain('legacy stuff')
    expect(result).not.toContain(LEGACY_MARKER_START)
    expect(result).toContain('content here')
    expect(result).toContain('Before')
    expect(result).toContain('After')
  })
})

// ── Universal engineering doctrine (node_000e52f0a152) ────────────────
//
// The block is the project-agnostic floor every agf user inherits, in every CLI
// and every mode. These assertions encode WHY it exists, not just that it is there:
// it must be command-agnostic (usable in a repo with no agf on PATH), it must ADD
// to the agf-specific golden rules rather than replace them, and it must survive
// the leanest mode — a non-negotiable rule that a verbosity setting can prune is
// not a floor.

/** Slice one `### `-headed section out of an emitted body (up to the next heading). */
function sliceSection(body: string, heading: string): string {
  const start = body.indexOf(heading)
  if (start === -1) return ''
  const next = body.indexOf('\n### ', start + heading.length)
  return next === -1 ? body.slice(start) : body.slice(start, next)
}

describe('AGF_UNIVERSAL_RULES — project-agnostic engineering doctrine', () => {
  it('is emitted in lean mode with at least 8 numbered rules', () => {
    const body = generateClaudeMdSection('demo', 'lean')
    expect(body).toContain(UNIVERSAL_RULES_HEADING)
    const block = sliceSection(body, UNIVERSAL_RULES_HEADING)
    const numbered = block.match(/^\d+\. /gm) ?? []
    expect(numbered.length).toBeGreaterThanOrEqual(8)
  })

  it('is command-agnostic — cites no agf command inside the block', () => {
    const block = sliceSection(generateClaudeMdSection('demo', 'lean'), UNIVERSAL_RULES_HEADING)
    // Assert the slice is real FIRST: an empty block vacuously "contains no agf",
    // which would make this test pass while the feature is absent.
    expect(block.length).toBeGreaterThan(0)
    expect(block).not.toContain('agf ')
  })

  it('ADDS to the agf golden rules instead of replacing them', () => {
    const body = generateClaudeMdSection('demo', 'lean')
    expect(body).toContain(UNIVERSAL_RULES_HEADING)
    expect(body).toContain('Regras de Ouro (antes de qualquer código)')
  })

  it('survives ultra-lean — a floor rule is not pruned by a verbosity mode', () => {
    expect(generateClaudeMdSection('demo', 'ultra-lean')).toContain(UNIVERSAL_RULES_HEADING)
  })
})

// ── Enforcement markers (node_fafa2546df32) ───────────────────────────
//
// Fourteen rules rendered as uniform prose tell the reader nothing about which
// ones a machine actually checks. That matters most for the rule that says
// enforcement must be a deterministic trigger rather than an agent remembering:
// stated without saying which rules HAVE a trigger, it is itself just a
// reminder. Declaring it per rule makes the block honest about its own teeth —
// and the honest answer is that most rules are advisory.
//
// The declaration is structural, not prose: rules are data, each carrying its
// enforcement, so a rule cannot be added without deciding. Nothing is enforced
// by default — an unrecognised rule is advisory, never assumed to have a guard.
describe('universal rules declare their enforcement', () => {
  it('every rule carries an enforcement decision', () => {
    expect(UNIVERSAL_RULES.length).toBeGreaterThanOrEqual(8)
    for (const rule of UNIVERSAL_RULES) {
      expect(rule.enforcement, `rule "${rule.text.slice(0, 40)}" has no enforcement`).toBeDefined()
    }
  })

  it('the file-size rule names the guard the init actually installs', () => {
    const sized = UNIVERSAL_RULES.find((r) => /arquivos e funções pequenos|800/i.test(r.text))
    expect(sized, 'no file-size rule found').toBeDefined()
    expect(sized?.enforcement).not.toBe('advisory')
    expect(String(sized?.enforcement)).toContain('file-size')
  })

  it('a rule with no hook is advisory — never enforced by default', () => {
    // The dangerous direction: claiming a guard that does not exist teaches the
    // reader to trust a check nobody runs.
    const advisory = UNIVERSAL_RULES.filter((r) => r.enforcement === 'advisory')
    expect(advisory.length).toBeGreaterThan(0)
    expect(advisory.length).toBeLessThan(UNIVERSAL_RULES.length)
  })

  it('the rendered block shows the marker for every rule', () => {
    const block = sliceSection(generateClaudeMdSection('demo', 'lean'), UNIVERSAL_RULES_HEADING)
    expect(block.length).toBeGreaterThan(0)
    for (const rule of UNIVERSAL_RULES) {
      expect(block, `marker missing for "${rule.text.slice(0, 30)}"`).toContain(rule.enforcement)
    }
  })

  it('ERRO/LIMITE: the existing guards survive — still command-agnostic, still numbered', () => {
    const block = sliceSection(generateClaudeMdSection('demo', 'lean'), UNIVERSAL_RULES_HEADING)
    expect(block).not.toContain('agf ')
    expect((block.match(/^\d+\. /gm) ?? []).length).toBeGreaterThanOrEqual(8)
  })
})

// ── Project doctrine extends the floor (node_e32649cb04b2) ────────────
//
// The universal block is the floor every project inherits; a project's OWN
// principles and language rules stack on top. Two properties make that safe:
// the floor is never displaced (a project cannot delete what it inherited by
// adding to it), and a project with nothing to add pays nothing — no empty
// heading, no placeholder, byte-identical to before.
//
// The generator stays pure: it receives already-read extensions, so reading a
// malformed source is the caller's failure to absorb, never a thrown generator.
describe('project extensions stack on the universal floor', () => {
  const heading = UNIVERSAL_RULES_HEADING

  it('a project with nothing to add pays nothing', () => {
    const plain = generateClaudeMdSection('demo', 'lean')
    const empty = generateClaudeMdSection('demo', 'lean', undefined, { principles: [], rulePacks: [] })
    expect(empty).toBe(plain)
  })

  it("a project's principles appear AFTER the floor, which stays intact", () => {
    const body = generateClaudeMdSection('demo', 'lean', undefined, {
      principles: ['Nunca commitar segredo no repositório.'],
    })
    expect(body).toContain(heading)
    expect(body).toContain('Nunca commitar segredo no repositório.')
    expect(body.indexOf('Nunca commitar segredo')).toBeGreaterThan(body.indexOf(heading))
  })

  it('a Go project does not receive TypeScript rule packs', () => {
    const packs = [
      { id: 'typescript', languages: ['typescript'], content: 'sem any' },
      { id: 'golang', languages: ['go'], content: 'erros explícitos' },
      { id: 'common', languages: [], content: 'vale para todos' },
    ]
    const body = generateClaudeMdSection('demo', 'lean', undefined, { rulePacks: packs, languages: ['go'] })
    expect(body).toContain('erros explícitos')
    expect(body).toContain('vale para todos')
    expect(body).not.toContain('sem any')
  })

  it('ERRO/LIMITE: extensions never displace the floor, however many are added', () => {
    // The failure that would matter: a project drowning the inherited rules, or
    // an extension rendered in place of them.
    const body = generateClaudeMdSection('demo', 'lean', undefined, {
      principles: ['um', 'dois', 'três'],
      rulePacks: [{ id: 'common', languages: [], content: 'x' }],
    })
    expect(body).toContain(heading)
    expect((body.match(/^\d+\. /gm) ?? []).length).toBeGreaterThanOrEqual(8)
  })

  it('ultra-lean carries the floor even when a project adds its own', () => {
    const body = generateClaudeMdSection('demo', 'ultra-lean', undefined, { principles: ['algo'] })
    expect(body).toContain(heading)
    expect(body).toContain('algo')
  })
})
