import { describe, it, expect, beforeAll } from 'vitest'
import { retrieveCommand, tfidfCosineScores, rerankCandidates } from '../core/rag-in/retrieve.js'
import type { CommandChunk, RetrievedCommand } from '../core/rag-in/retrieve.js'

const corpus: CommandChunk[] = [
  {
    id: 'tar-extract',
    intent: 'extract a gzipped tar archive',
    command: 'tar -xzf {file.tar.gz}',
    family: 'unix',
    tool: 'tar',
    flags_explained: '',
    danger: false,
    source: 'tldr',
  },
  {
    id: 'tar-create',
    intent: 'create a gzipped tar archive',
    command: 'tar -czf {target.tar.gz} {files}',
    family: 'unix',
    tool: 'tar',
    flags_explained: '',
    danger: false,
    source: 'tldr',
  },
  {
    id: 'grep-pattern',
    intent: 'search for a pattern in a file',
    command: 'grep {pattern} {file}',
    family: 'unix',
    tool: 'grep',
    flags_explained: '',
    danger: false,
    source: 'tldr',
  },
  {
    id: 'rm-recursive',
    intent: 'recursively delete a directory',
    command: 'rm -rf {dir}',
    family: 'unix',
    tool: 'rm',
    flags_explained: '',
    danger: true,
    source: 'tldr',
  },
  {
    id: 'ls-list',
    intent: 'list files in a directory',
    command: 'ls -la {dir}',
    family: 'unix',
    tool: 'ls',
    flags_explained: '',
    danger: false,
    source: 'tldr',
  },
]

describe('retrieveCommand', () => {
  it('returns the correct command top-1 for a natural-language intent', () => {
    const res = retrieveCommand('extract a gzipped tar.gz archive', corpus)
    expect(res.decision).toBe('retrieved')
    expect(res.top?.id).toBe('tar-extract')
    expect(res.top?.command).toContain('tar -xzf')
    expect(res.confidence).toBeGreaterThanOrEqual(0.5)
  })

  it('matches "tar.gz" against the tar tool (dot-split tokenization)', () => {
    const res = retrieveCommand('extract a gzipped tar.gz archive', corpus)
    expect(res.top?.id).toBe('tar-extract')
    expect(res.confidence).toBeGreaterThan(0.5)
  })

  it('retrieves by intent even when the tool name is not in the query', () => {
    const res = retrieveCommand('find a pattern inside a file', corpus)
    expect(res.decision).toBe('retrieved')
    expect(res.top?.tool).toBe('grep')
  })

  it('falls back to --help when confidence is below the threshold', () => {
    const res = retrieveCommand('xyzzy frobnicate quux blorp', corpus)
    expect(res.decision).toBe('fallback_help')
    expect(res.confidence).toBeLessThan(0.5)
    // never invents a command — fallback is an instruction string, not a guess executed
    expect(res.fallback === null || res.fallback.endsWith('--help')).toBe(true)
  })

  it('never returns a command that is not in the corpus', () => {
    const res = retrieveCommand('list directory contents', corpus)
    if (res.top) expect(corpus.some((c) => c.id === res.top!.id)).toBe(true)
  })

  it('propagates danger so the caller can require confirmation', () => {
    const res = retrieveCommand('recursively delete a directory', corpus)
    expect(res.top?.id).toBe('rm-recursive')
    expect(res.top?.danger).toBe(true)
  })

  it('respects a custom threshold', () => {
    // threshold > 1.0 is above the maximum possible confidence → always fallback
    const strict = retrieveCommand('list files', corpus, { threshold: 1.01 })
    expect(strict.decision).toBe('fallback_help')
  })

  it('returns empty/fallback for an empty corpus without throwing', () => {
    const res = retrieveCommand('anything', [])
    expect(res.decision).toBe('fallback_help')
    expect(res.top).toBeNull()
    expect(res.candidates).toHaveLength(0)
  })
})

describe('tfidfCosineScores — intent embedding', () => {
  const tokenize = (s: string) =>
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 0)

  it('returns cosine score > 0 when query shares terms with an intent', () => {
    const intents = [tokenize('search for a pattern in a file'), tokenize('create a gzipped tar archive')]
    const scores = tfidfCosineScores(tokenize('find text inside a file'), intents)
    // "file" is shared → first intent gets a nonzero cosine score
    expect(scores[0]).toBeGreaterThan(0)
  })

  it('returns 0 for an intent with no overlapping terms', () => {
    const intents = [tokenize('completely unrelated xyzzy frobnicate')]
    const scores = tfidfCosineScores(tokenize('search file'), intents)
    expect(scores[0]).toBe(0)
  })

  it('ranks the more-similar intent higher', () => {
    const intents = [
      tokenize('search for a pattern in a file'), // shares: file
      tokenize('create archive from multiple files'), // shares: file
      tokenize('list directory entries'), // no overlap
    ]
    const scores = tfidfCosineScores(tokenize('search file'), intents)
    // first intent shares "search" and "file" → highest score
    expect(scores[0]).toBeGreaterThan(scores[2])
  })

  it('returns all zeros for empty query tokens', () => {
    const intents = [tokenize('search for a pattern')]
    const scores = tfidfCosineScores([], intents)
    expect(scores.every((s) => s === 0)).toBe(true)
  })

  it('returns empty array for empty corpus', () => {
    expect(tfidfCosineScores(tokenize('query'), [])).toEqual([])
  })

  it('intent embedding boosts grep over tar for "locate text in file" query', () => {
    const res = retrieveCommand('locate text in file', corpus)
    // grep intent = "search for a pattern in a file" shares "file"
    // tar intents don't mention "file" (they mention archive)
    // TF-IDF cosine on intent should help grep beat tar
    expect(res.top?.tool).toBe('grep')
  })
})

describe('RRF fusion — 3 signals', () => {
  it('candidate strong on all 3 signals outscores one strong on only 1', () => {
    // doc A: "grep" matches query by intent (BM25 + cosine) AND by name
    // doc B: "tar-extract" matches by name token only
    const focusCorpus: CommandChunk[] = [
      {
        id: 'tar-extract',
        intent: 'create a gzipped archive',
        command: 'tar -xzf {f}',
        family: 'unix',
        tool: 'tar',
        flags_explained: '',
        danger: false,
        source: 'tldr',
      },
      {
        id: 'grep-pattern',
        intent: 'search for text in a file',
        command: 'grep {pattern} {file}',
        family: 'unix',
        tool: 'grep',
        flags_explained: '',
        danger: false,
        source: 'tldr',
      },
    ]
    const res = retrieveCommand('search for text in a file', focusCorpus)
    // grep matches on all three: BM25 full-text, TF-IDF cosine intent, name overlap
    expect(res.top?.id).toBe('grep-pattern')
  })

  it('top candidate score is strictly > 0 for a matching query', () => {
    const res = retrieveCommand('extract archive', corpus)
    expect(res.candidates[0]?.score).toBeGreaterThan(0)
  })

  it('candidates array is sorted descending by fused RRF score', () => {
    const res = retrieveCommand('delete directory', corpus)
    const scores = res.candidates.map((c) => c.score)
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i])
    }
  })
})

describe('rerankCandidates — cross-encoder top-k', () => {
  function makeCandidate(id: string, intent: string, command: string, tool: string): RetrievedCommand {
    const chunk: CommandChunk = {
      id,
      intent,
      command,
      family: 'unix',
      tool,
      flags_explained: '',
      danger: false,
      source: 'tldr',
    }
    return { chunk, score: 1.0 }
  }

  it('returns at most k results', () => {
    const cands = [
      makeCandidate('a', 'extract tar archive', 'tar -xzf f', 'tar'),
      makeCandidate('b', 'create tar archive', 'tar -czf f', 'tar'),
      makeCandidate('c', 'search pattern in file', 'grep p f', 'grep'),
      makeCandidate('d', 'list directory', 'ls -la', 'ls'),
      makeCandidate('e', 'delete file', 'rm file', 'rm'),
    ]
    const result = rerankCandidates('search pattern', cands, 3)
    expect(result.length).toBe(3)
  })

  it('places the best intent-matching candidate first', () => {
    const cands = [
      makeCandidate('tar', 'create compressed archive', 'tar -czf f', 'tar'),
      makeCandidate('grep', 'search for a pattern in a file', 'grep p f', 'grep'),
    ]
    const result = rerankCandidates('search for pattern', cands, 2)
    expect(result[0]!.chunk.id).toBe('grep')
  })

  it('returns fewer than k if fewer candidates provided', () => {
    const cands = [makeCandidate('a', 'list files', 'ls', 'ls')]
    expect(rerankCandidates('list files', cands, 5)).toHaveLength(1)
  })

  it('returns empty for empty candidate list', () => {
    expect(rerankCandidates('query', [], 3)).toEqual([])
  })

  it('retrieveCommand uses rerank — top candidate has max term coverage', () => {
    const res = retrieveCommand('extract gzipped tar archive', corpus, { k: 3 })
    // tar-extract intent "extract a gzipped tar archive" has perfect coverage
    expect(res.top?.id).toBe('tar-extract')
  })
})

// ── AC1 + AC2: registry corpus includes risk triage + loop subcommands ────────

describe('COMMAND_REGISTRY — risk triage + loop subcommands (AC1+AC2)', () => {
  let defaultCorpus: import('../core/rag-in/command-chunk.js').CommandChunk[]

  beforeAll(async () => {
    const { loadDefaultCorpus } = await import('../core/rag-in/builtin-corpus.js')
    defaultCorpus = loadDefaultCorpus()
  })

  it('corpus contains risk triage command (AC1)', () => {
    const found = defaultCorpus.some((c) => c.command.includes('risk triage') || c.intent.includes('risk'))
    expect(found).toBe(true)
  })

  it('retrieveCommand top-3 includes risk triage for drain-risk intent (AC1)', () => {
    const res = retrieveCommand('drenar risco em task promote risk', defaultCorpus, { k: 5 })
    const top3Commands = res.candidates.slice(0, 3).map((r) => r.chunk.command)
    expect(top3Commands.some((c) => c.includes('risk'))).toBe(true)
  })

  it('corpus contains loop start command (AC2)', () => {
    const found = defaultCorpus.some((c) => c.command.includes('loop start') || c.command.includes('loop'))
    expect(found).toBe(true)
  })

  it('retrieveCommand top-3 includes loop start for continuous loop intent (AC2)', () => {
    const res = retrieveCommand('agendar loop continuo background start', defaultCorpus, { k: 5 })
    const top3Commands = res.candidates.slice(0, 3).map((r) => r.chunk.command)
    expect(top3Commands.some((c) => c.includes('loop'))).toBe(true)
  })
})

describe('skill install — discoverable in the language people actually type (node_2caea24f28d1)', () => {
  let defaultCorpus: import('../core/rag-in/command-chunk.js').CommandChunk[]

  beforeAll(async () => {
    const { loadDefaultCorpus } = await import('../core/rag-in/builtin-corpus.js')
    defaultCorpus = loadDefaultCorpus()
  })

  it('is present in the corpus at all — registration is the precondition, not the goal', () => {
    expect(defaultCorpus.some((c) => c.command.includes('skill install'))).toBe(true)
  })

  // A descrição do comando está em português na 3ª pessoa ("Instala uma skill de um
  // repositório git"); quem pergunta escreve o infinitivo. Sem `instalar` no léxico não
  // há ponte: nem para `instala` (mesma língua, outra flexão) nem para `install` (o token
  // do próprio caminho do comando). O comando existia, aparecia no --help, e ninguém o
  // achava — que é a promessa do épico ("qualquer pessoa consegue instalar") falhando na
  // última perna.
  it.each([
    'instalar uma skill',
    'instalar skills atualizadas do repositorio publico',
    'como instalar as skills do github',
  ])('finds it for the natural phrasing: %s', (query) => {
    const res = retrieveCommand(query, defaultCorpus, { k: 5 })
    const top3 = res.candidates.slice(0, 3).map((r) => r.chunk.command)
    expect(
      top3.some((c) => c.includes('skill install')),
      `top-3 was ${JSON.stringify(top3)}`,
    ).toBe(true)
  })

  it('still finds it when asked in English — the bridge works in both directions', () => {
    const res = retrieveCommand('install a skill from a git repository', defaultCorpus, { k: 5 })
    const top3 = res.candidates.slice(0, 3).map((r) => r.chunk.command)
    expect(top3.some((c) => c.includes('skill install'))).toBe(true)
  })
})
