/*!
 * WHY: Lightweight heuristic taint analysis to catch source→sink flows without a
 * full AST or code-graph lookup. Uses line-order as a proxy for data flow: if a
 * SOURCE pattern appears before a SINK pattern in the same file, and no sanitizer
 * is detected between them, a finding is emitted with the confidence scaled down
 * by the number of intervening lines (farther apart = lower confidence).
 *
 * LIMITS (documented as required by task spec):
 *  - Line-order is not actual data flow; inter-procedural taint is not detected.
 *  - Sanitizers are detected by pattern, not by semantic guarantee.
 *  - No cross-file propagation (each file is analyzed independently).
 *  - False negatives possible for obfuscated or heavily aliased flows.
 *
 * Composes with: scan-cmd.ts (aggregation), harness/violation-detail.ts (shape).
 * Contract: analyzeTaint(src, file) → TaintFinding[] — pure, deterministic, no I/O.
 */

export interface TaintFinding {
  /** Relative file path. */
  file: string
  /** Source pattern that introduces tainted data. */
  source: string
  /** Line where the source was detected (1-based). */
  sourceLine: number
  /** Sink that receives potentially tainted data. */
  sink: string
  /** Line where the sink was detected (1-based). */
  sinkLine: number
  /** Estimated confidence [0,1]. Reduced when sanitizers are present. */
  confidence: number
  /** Human-readable path summary. */
  path: string
}

// ── Sources ──────────────────────────────────────────────────────────────────

interface TaintSource {
  name: string
  pattern: RegExp
}

const SOURCES: readonly TaintSource[] = [
  { name: 'process.argv', pattern: /\bprocess\.argv\b/ },
  { name: 'fetch body', pattern: /\bresponse\.(?:json|text)\s*\(\s*\)/ },
  { name: 'JSON.parse(file)', pattern: /JSON\.parse\s*\(\s*readFileSync/ },
  { name: 'process.env', pattern: /\bprocess\.env\b/ },
  { name: 'req.body', pattern: /\breq\.body\b/ },
  { name: 'req.query', pattern: /\breq\.query\b/ },
  { name: 'req.params', pattern: /\breq\.params\b/ },
]

// ── Sinks ─────────────────────────────────────────────────────────────────────

interface TaintSink {
  name: string
  pattern: RegExp
}

const SINKS: readonly TaintSink[] = [
  { name: 'execSync', pattern: /\bexecSync\s*\(/ },
  { name: 'exec', pattern: /\bexec\s*\(/ },
  { name: 'execFile', pattern: /\bexecFile\s*\(/ },
  { name: 'new RegExp', pattern: /\bnew\s+RegExp\s*\(/ },
  { name: 'fetch(url)', pattern: /\bfetch\s*\(\s*(?:[a-zA-Z_$][\w$]*|`[^`]*`)/ },
  { name: 'db.prepare interpolated', pattern: /\bdb\.prepare\s*\(\s*`[^`]*\$\{/ },
  { name: 'eval', pattern: /\beval\s*\(/ },
  { name: 'Function constructor', pattern: /\bnew\s+Function\s*\(/ },
]

// ── Sanitizers ────────────────────────────────────────────────────────────────

const SANITIZERS: readonly RegExp[] = [
  /\bz\.\w+\(\)\.parse\s*\(/, // Zod: z.string().parse(x)
  /\.safeParse\s*\(/, // Zod: schema.safeParse(x)
  /\.parse\s*\(/, // any .parse() call (schema validation)
  /ALLOW(?:ED|LIST|_LIST)\b/, // allowlist variable reference
  /allowlist\b/i, // allowlist variable reference
  /\.includes\s*\(/, // includes check (allowlist pattern)
  /if\s*\(!.*includes/, // if (!allowed.includes(...))
  /encodeURIComponent\s*\(/, // URI encoding
  /DOMPurify\.sanitize\s*\(/, // DOM sanitization
  /escape\s*\(/, // escape function
]

function hasSanitizerBetween(lines: string[], fromLine: number, toLine: number): boolean {
  const slice = lines.slice(fromLine, toLine)
  return slice.some((l) => SANITIZERS.some((re) => re.test(l)))
}

/**
 * Analyze a source file for tainted data flows.
 * Returns findings sorted by confidence descending.
 */
export function analyzeTaint(source: string, file: string): TaintFinding[] {
  const lines = source.split(/\r?\n/)
  const findings: TaintFinding[] = []

  // Collect source occurrences
  const sourceHits: Array<{ source: TaintSource; line: number }> = []
  for (let i = 0; i < lines.length; i++) {
    for (const src of SOURCES) {
      if (src.pattern.test(lines[i]!)) {
        sourceHits.push({ source: src, line: i })
      }
    }
  }

  if (sourceHits.length === 0) return []

  // For each sink, check if any source precedes it without a sanitizer
  for (let i = 0; i < lines.length; i++) {
    for (const sink of SINKS) {
      if (!sink.pattern.test(lines[i]!)) continue

      for (const hit of sourceHits) {
        if (hit.line >= i) continue // source must precede sink

        const sanitized = hasSanitizerBetween(lines, hit.line, i)
        // Confidence: base 0.8 reduced if sanitizer found, further reduced by distance
        const distance = i - hit.line
        const distancePenalty = Math.min(0.3, distance * 0.01)
        const confidence = sanitized ? 0.2 - distancePenalty : 0.8 - distancePenalty

        findings.push({
          file,
          source: hit.source.name,
          sourceLine: hit.line + 1,
          sink: sink.name,
          sinkLine: i + 1,
          confidence: Math.max(0, confidence),
          path: `${hit.source.name} (line ${hit.line + 1}) → ${sink.name} (line ${i + 1})`,
        })
      }
    }
  }

  return findings.sort((a, b) => b.confidence - a.confidence)
}
