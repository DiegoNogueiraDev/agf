/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 *
 *
 * Capability lexicon — the single source of truth for the cross-repo gap diff.
 *
 * Each entry maps a capability tag to (a) keyword/regex patterns used to detect
 * it in a neighbour repo's README/manifests, and (b) the curated, ranked insight
 * metadata (pillar/effort/impact/source/idea) gathered from manual exploration.
 * The deterministic scan supplies the *signal*; this lexicon supplies the
 * *judgment*, so the emitted report reads as a ranked evaluation, not a keyword
 * dump.
 *
 * `agfCapabilities()` derives what `agf` ALREADY has (curated base ∪ command-
 * derived), so the gap diff only surfaces what is genuinely missing.
 */

/** The three pillars from the project promise (CLAUDE.md). */
export type Pillar = 'token-cost' | 'swe' | 'speed'

/** Coarse effort/impact rating. */
export type Level = 'low' | 'med' | 'high'

export interface CapabilitySpec {
  /** Stable kebab-case identifier used by the gap diff. */
  tag: string
  /** Human label for reports. */
  label: string
  /** Any-match patterns over lowercased repo text. */
  patterns: RegExp[]
  pillar: Pillar
  effort: Level
  impact: Level
  /** The concrete transferable idea (one line). */
  insight: string
}

/**
 * The lexicon. Order = default ranking in the report (token-cost wins first,
 * then high-impact SWE/speed). Tags that agf already has (e.g. output
 * compression, provider failover) are still listed so detection works and the
 * gap diff can be shown to *exclude* them.
 */
export const CAPABILITY_LEXICON: CapabilitySpec[] = [
  {
    tag: 'content-router',
    label: 'Content-aware compression router',
    patterns: [/content[- ]?router/i, /content[- ]?aware compress/i, /smartcrusher|codecompressor|kompress/i],
    pillar: 'token-cost',
    effort: 'med',
    impact: 'high',
    insight: 'Route tool output by type (JSON/code/prose) to the right compressor before the LLM sees it.',
  },
  {
    tag: 'reversible-compression',
    label: 'Reversible compression (CCR)',
    patterns: [/reversible compress/i, /\bccr\b/i, /retrieve.{0,20}(original|uncompressed)/i],
    pillar: 'token-cost',
    effort: 'med',
    impact: 'high',
    insight: 'Compress lossily but keep originals on disk; the LLM retrieves the full version on demand.',
  },
  {
    tag: 'prompt-cache',
    label: 'Prompt / context caching',
    patterns: [/prompt cach/i, /kv[- ]?cache/i, /cache.{0,12}(prefix|prompt|context)/i, /cachealigner/i],
    pillar: 'token-cost',
    effort: 'med',
    impact: 'high',
    insight: 'Hash task context + model id to a disk cache with TTL refresh; reuse on repeat context packs.',
  },
  {
    tag: 'affected-tests',
    label: 'Affected-tests inference',
    patterns: [/affected tests?/i, /impact(ed)? tests?/i, /blast[- ]?radius/i, /only.{0,15}impacted tests/i],
    pillar: 'speed',
    effort: 'med',
    impact: 'high',
    insight: 'From a git diff, trace the dependency graph to run only the transitively-impacted tests.',
  },
  {
    tag: 'lsp-symbolic-edit',
    label: 'AST/LSP symbolic editing',
    patterns: [/\blsp\b/i, /language server/i, /symbol(ic)? edit/i, /replace_symbol|insert_(before|after)_symbol/i],
    pillar: 'swe',
    effort: 'high',
    impact: 'high',
    insight: 'Symbol-scoped edits (replace_symbol_body, cross-file rename) instead of line-range diffs.',
  },
  {
    tag: 'multi-source-search',
    label: 'Multi-source external search',
    patterns: [/multi[- ]?source/i, /reciprocal rank fusion/i, /\brrf\b/i, /parallel.{0,12}search/i],
    pillar: 'speed',
    effort: 'high',
    impact: 'high',
    insight: 'Fan out to many external sources, dedupe by entity, fuse with RRF to ground decisions in current state.',
  },
  {
    tag: 'memory-decay',
    label: 'Memory consolidation + decay',
    patterns: [/\bdecay\b/i, /ebbinghaus/i, /forgetting curve/i, /memory consolidat/i],
    pillar: 'token-cost',
    effort: 'high',
    impact: 'med',
    insight: '4-tier consolidation with access-frequency decay keeps memory fresh and small.',
  },
  {
    tag: 'temporal-memory',
    label: 'Temporal memory (validity windows)',
    patterns: [/temporal (knowledge|memory|graph)/i, /valid_(from|until)/i, /validity window/i],
    pillar: 'swe',
    effort: 'high',
    impact: 'med',
    insight: 'Stamp memories with valid_from/valid_until so only currently-valid facts are injected.',
  },
  {
    tag: 'auto-capture-hooks',
    label: 'Auto-capture memory hooks',
    patterns: [
      /auto[- ]?capture/i,
      /(sessionstart|userpromptsubmit|pretooluse|posttooluse|precompact)/i,
      /memory hooks?/i,
    ],
    pillar: 'speed',
    effort: 'high',
    impact: 'high',
    insight: 'Lifecycle hooks capture context automatically instead of manual memory writes.',
  },
  {
    tag: 'file-watcher',
    label: 'File-watcher incremental sync',
    patterns: [/file ?watcher/i, /watch(es|ing)?.{0,12}files?/i, /incremental (sync|index)/i, /debounced.{0,10}sync/i],
    pillar: 'speed',
    effort: 'med',
    impact: 'med',
    insight: 'Watch the tree and incrementally re-sync the graph so long-lived autopilot sessions never drift.',
  },
  {
    tag: 'self-review',
    label: 'Inline self-review checklist',
    patterns: [/self[- ]?review/i, /review checklist/i, /self[- ]?critique/i],
    pillar: 'swe',
    effort: 'med',
    impact: 'high',
    insight: 'A cheap inline checklist (placeholder scan, scope check) replaces expensive subagent review loops.',
  },
  {
    tag: 'skill-composition',
    label: 'Skill composition / chaining',
    patterns: [/skill compos/i, /compose (skills|workflows)/i, /skill chain/i, /skills auto[- ]?compose/i],
    pillar: 'speed',
    effort: 'med',
    impact: 'high',
    insight: 'Skills call other skills (TDD → diagnose → request-review) with defined exit criteria.',
  },
  {
    tag: 'doc-to-markdown',
    label: 'Robust document → Markdown conversion',
    patterns: [
      /markitdown/i,
      /document.{0,12}to.{0,8}markdown/i,
      /converterregistration|markitdown\.plugin/i,
      /\bmagika\b/i,
    ],
    pillar: 'swe',
    effort: 'med',
    impact: 'med',
    insight:
      'Plugin-registry + ML mime-detection (magika) for any-format→Markdown, hardening `agf import-prd` beyond extensions.',
  },
  {
    tag: 'hybrid-search',
    label: 'Hybrid keyword + vector search',
    patterns: [
      /hybrid search/i,
      /bm25.{0,24}(cosine|vector|embedding)/i,
      /\bsqlite-vec\b/i,
      /cosine similarity/i,
      /embedding[- ]?lane/i,
    ],
    pillar: 'speed',
    effort: 'med',
    impact: 'med',
    insight: 'Fuse FTS5/BM25 with vector cosine (sqlite-vec) for semantic recall when keywords differ across sessions.',
  },
  {
    tag: 'failure-driven-learning',
    label: 'Failure-driven learning loop',
    patterns: [
      /teacher[- ]?escalation/i,
      /failure[- ]?(driven|mining)/i,
      /feedback[- ]?loop/i,
      /learn from (failures|mistakes)/i,
      /corrective (reply|skill)/i,
    ],
    pillar: 'swe',
    effort: 'med',
    impact: 'high',
    insight:
      'Record corrections when predictions are wrong; consult past mistakes and escalate to a teacher model to write durable skills.',
  },
  {
    tag: 'progressive-disclosure',
    label: 'Progressive-disclosure skill context',
    patterns: [
      /progressive disclosure/i,
      /tiered (detail|context|expansion)/i,
      /signature.{0,12}example.{0,12}(full|docs)/i,
    ],
    pillar: 'token-cost',
    effort: 'low',
    impact: 'med',
    insight:
      'Expose skills at tiered detail (signature → example → full) so agents pull depth on demand instead of paying for it upfront.',
  },
  {
    tag: 'producer-reviewer',
    label: 'Producer-reviewer agent pattern',
    patterns: [/producer[- ]?reviewer/i, /generator.{0,12}validator/i, /reviewer (agent|loop|team)/i],
    pillar: 'swe',
    effort: 'med',
    impact: 'med',
    insight:
      'A second agent reviews the producer’s output before done — multi-agent review beyond deterministic DoD gates.',
  },
  {
    tag: 'format-routing',
    label: 'Policy-driven output-format routing',
    patterns: [/output format (routing|decision|policy|matrix)/i, /format (router|matrix)/i, /surface (skill|policy)/i],
    pillar: 'speed',
    effort: 'low',
    impact: 'med',
    insight:
      'Decide HTML/MD/JSON/hybrid by intent×consumer×size before generating, instead of always defaulting to Markdown.',
  },
  {
    tag: 'agent-generated-helpers',
    label: 'Agent-generated reusable helpers',
    patterns: [
      /agent[- ]?(generated|written) (helper|code)/i,
      /self[- ]?improving (agent|helper|skill)/i,
      /agent_helpers/i,
      /domain[- ]?skills?/i,
    ],
    pillar: 'speed',
    effort: 'med',
    impact: 'med',
    insight: 'Let tasks write & persist helper fragments/runbooks so the next run reuses what was figured out.',
  },
  {
    tag: 'local-inference-optimization',
    label: 'Local inference optimization (sharding/quant)',
    patterns: [
      /layer[- ]?wise (inference|sharding|loading)/i,
      /block[- ]?wise quantization/i,
      /bitsandbytes/i,
      /(70b|405b|large model).{0,18}(gpu|vram)/i,
    ],
    pillar: 'token-cost',
    effort: 'high',
    impact: 'high',
    insight:
      'Layer-wise sharding + block-wise quant run big models on small VRAM → $0/token local frontier for cheap tiers.',
  },
  {
    tag: 'persistent-daemon',
    label: 'Persistent session-isolated daemon',
    patterns: [
      /persistent daemon/i,
      /long[- ]?lived daemon/i,
      /cdp[- ]?daemon/i,
      /session isolation/i,
      /no cold[- ]?start/i,
    ],
    pillar: 'speed',
    effort: 'med',
    impact: 'high',
    insight:
      'A long-lived per-workspace daemon (tree-sitter/search index) with session isolation cuts per-call cold-start latency.',
  },
  {
    tag: 'ideal-state-artifact',
    label: 'Ideal-State Artifact (ISA) primitive',
    patterns: [/ideal[- ]?state artifact/i, /ideal state criteria/i, /\bISC\b/, /system of record.{0,20}spec/i],
    pillar: 'swe',
    effort: 'high',
    impact: 'high',
    insight: 'One artifact that is spec + test harness + done-condition + system-of-record, replacing loose prose AC.',
  },
  {
    tag: 'effort-tier-classifier',
    label: 'Mode + effort-tier classifier',
    patterns: [
      /mode[- ]?classifier/i,
      /effort (tier|level).{0,10}e[1-5]/i,
      /\bE1\b[\s\S]{0,12}\bE5\b/,
      /thinking[- ]?capabilit/i,
    ],
    pillar: 'token-cost',
    effort: 'med',
    impact: 'high',
    insight:
      'Classify each task MINIMAL/NATIVE/ALGORITHM and hard-gate effort tiers, spending tokens only where warranted.',
  },
  {
    tag: 'deterministic-codegen',
    label: 'Deterministic spec→code generation',
    patterns: [
      /deterministic (codegen|code generation)/i,
      /idempotent generation/i,
      /@generated\b/i,
      /contract[- ]?(yaml|driven).{0,12}(codegen|generation|routing)/i,
      /pareto split/i,
    ],
    pillar: 'token-cost',
    effort: 'high',
    impact: 'med',
    insight:
      'Split judgment (tiny contract) from mechanical translation; generate boilerplate deterministically, idempotently — zero LLM tokens.',
  },
  {
    tag: 'pack-system',
    label: 'AI-installable pack/profile system',
    patterns: [
      /\bpacks? system\b/i,
      /ai[- ]?installable/i,
      /install\.md|verify\.md/i,
      /selective[- ]?install|install[- ]?profile/i,
      /standalone (skill|pack)/i,
    ],
    pillar: 'speed',
    effort: 'med',
    impact: 'med',
    insight:
      'Ship skills/tools as standalone installable packs/profiles so teams onboard only what they need (less context bloat).',
  },
  {
    tag: 'iterative-deep-research',
    label: 'Iterative deep-research synthesis',
    patterns: [
      /deep research/i,
      /iterative research/i,
      /multi[- ]?turn (fact[- ]?check|research)/i,
      /source quality filter/i,
      /deepresearcher/i,
    ],
    pillar: 'speed',
    effort: 'high',
    impact: 'med',
    insight:
      'Multi-turn gather→read→fact-check→synthesize loop with low-quality-source filtering, beyond one-shot local search.',
  },
  {
    tag: 'domain-vocabulary',
    label: 'Domain vocabulary (CONTEXT.md)',
    patterns: [/ubiquitous language/i, /context\.md/i, /domain (glossary|vocabulary)/i, /grill[- ]?with[- ]?docs/i],
    pillar: 'token-cost',
    effort: 'med',
    impact: 'high',
    insight:
      'Auto-discover a shared domain glossary and inject it so agents stop re-explaining terms — large verbosity cut.',
  },
  {
    tag: 'streaming-ir',
    label: 'Streaming IR for large files',
    patterns: [
      /streaming (ir|engine|transducer)/i,
      /universal ir\b/i,
      /tree transducer/i,
      /o\(1\) memory/i,
      /files? > ?\d+k? lines/i,
    ],
    pillar: 'speed',
    effort: 'high',
    impact: 'med',
    insight: 'Parse→universal-IR→emit with O(1)-memory streaming for files/monorepos too big to hold in memory.',
  },
  // ---- capabilities agf ALREADY has (kept so the diff visibly excludes them) ----
  {
    tag: 'output-compression',
    label: 'Tool-output compression',
    patterns: [/token (killer|saving|reduction)/i, /compress(ion|or)?\b/i, /60[-–]90% (token|saving)/i],
    pillar: 'token-cost',
    effort: 'med',
    impact: 'high',
    insight: 'agf already ships `agf compress`; the open gap is auto-detect-by-command-type upstream of the router.',
  },
  {
    tag: 'provider-failover',
    label: 'Provider failover chain',
    patterns: [/fail[- ]?over/i, /fallback (provider|chain)/i, /multi[- ]?provider.{0,12}fallback/i],
    pillar: 'speed',
    effort: 'med',
    impact: 'med',
    insight: 'agf already has `agf provider failover`; listed only to demonstrate the gap diff excludes it.',
  },
]

/** Tags agf already has, independent of command surface (curated base). */
const AGF_BASE_CAPABILITIES: readonly string[] = [
  'graph-engine',
  'repo-map',
  'tier-router',
  'output-compression',
  'content-router',
  'provider-failover',
  'code-intel',
  'local-search',
  'token-ledger',
]

/** Map a known `agf` command name to the capability it provides (if any). */
const COMMAND_CAPABILITY: Readonly<Record<string, string>> = {
  compress: 'output-compression',
  provider: 'provider-failover',
  code: 'code-intel',
  search: 'local-search',
  metrics: 'token-ledger',
  savings: 'token-ledger',
  model: 'tier-router',
}

/**
 * The set of capabilities agf already has: curated base ∪ command-derived.
 * Pass `listCommandNames()` (from command-surface) to make the registry the
 * source of truth; omit it to use the curated base only.
 */
export function agfCapabilities(commandNames: readonly string[] = []): Set<string> {
  const set = new Set<string>(AGF_BASE_CAPABILITIES)
  for (const name of commandNames) {
    const cap = COMMAND_CAPABILITY[name]
    if (cap) set.add(cap)
  }
  return set
}

/** Detect capability tags present in a blob of repo text (README + manifests). */
export function detectCapabilities(text: string): string[] {
  const found: string[] = []
  for (const spec of CAPABILITY_LEXICON) {
    if (spec.patterns.some((re) => re.test(text))) found.push(spec.tag)
  }
  return found
}

/** Look up a spec by tag (undefined if unknown). */
export function specForTag(tag: string): CapabilitySpec | undefined {
  return CAPABILITY_LEXICON.find((s) => s.tag === tag)
}
