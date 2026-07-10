#!/usr/bin/env node
/**
 * guard-file-size — PreToolUse guardrail (global).
 *
 * PORQUÊ: forçar modularização / Clean Code — nunca criar arquivos de código
 * gigantes em um único Write/Edit. Bloqueia (permissionDecision: "deny") quando
 * o conteúdo de um arquivo de CÓDIGO-FONTE excede o limite de linhas; manda
 * extrair em módulos (SRP, 1 responsabilidade por arquivo).
 *
 * CONTRATO (Claude Code hooks):
 *  - stdin: JSON { tool_name, tool_input:{ file_path, content?, new_string? } }
 *  - stdout (bloquear): { hookSpecificOutput:{ hookEventName:"PreToolUse",
 *      permissionDecision:"deny", permissionDecisionReason:"…" } }
 *  - allow = exit 0 sem stdout.
 *
 * INVARIANTE: fail-open — qualquer erro/dúvida → ALLOW (um hook nunca deve
 * travar trabalho legítimo por um bug próprio).
 *
 * Só vale para código-fonte; isenta gerados/dados/lockfiles/minificados/
 * vendored/build. Limite via env CLAUDE_MAX_FILE_LINES (default 800).
 */

const THRESHOLD = Number(process.env.CLAUDE_MAX_FILE_LINES) || 800

// Extensões de código-fonte onde a regra "extrair antes de crescer" se aplica.
const SOURCE_EXTS = new Set([
  // JS/TS
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'cts',
  'mts',
  'vue',
  'svelte',
  'astro',
  // Python / Ruby / PHP / Perl
  'py',
  'rb',
  'php',
  'pl',
  'pm',
  // C-family
  'c',
  'h',
  'cpp',
  'hpp',
  'cc',
  'cxx',
  'hxx',
  'cs',
  'm',
  'mm',
  // Go / Rust / Zig / Nim / V / Crystal / D / Pascal
  'go',
  'rs',
  'zig',
  'nim',
  'v',
  'cr',
  'd',
  'pas',
  // JVM
  'java',
  'kt',
  'kts',
  'scala',
  'groovy',
  'gradle',
  // Apple / mobile
  'swift',
  'dart',
  // Functional
  'ex',
  'exs',
  'erl',
  'hrl',
  'hs',
  'ml',
  'mli',
  'fs',
  'fsx',
  'fsi',
  'clj',
  'cljs',
  'cljc',
  'edn',
  'elm',
  'res',
  'resi',
  'gleam',
  'rkt',
  'scm',
  'lisp',
  // Scripts / outras
  'sh',
  'bash',
  'zsh',
  'lua',
  'r',
  'jl',
  'sql',
])

// Caminhos isentos mesmo sendo .ts/.js (não são código que o autor mantém à mão).
const EXEMPT_PATTERNS = [
  '/node_modules/',
  '/dist/',
  '/build/',
  '/.next/',
  '/vendor/',
  '/coverage/',
  '.min.',
  '.gen.',
  '.generated.',
  '.d.ts',
  '.snap',
  '-lock.',
  '.bundle.',
]

function allow() {
  process.exit(0)
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  )
  process.exit(0)
}

function isExempt(filePath) {
  // Prefixa '/' para que padrões de diretório ('/dist/') casem em paths
  // relativos ('dist/foo.js') tanto quanto em absolutos.
  const lower = ('/' + filePath).toLowerCase()
  return EXEMPT_PATTERNS.some((p) => lower.includes(p))
}

const HANDLED_TOOLS = new Set(['Write', 'Edit', 'MultiEdit'])

// Conta linhas ignorando um único newline final (não punir arquivos no limite).
function linesOf(text) {
  if (typeof text !== 'string' || text.length === 0) return 0
  return text.replace(/\n$/, '').split('\n').length
}

function evaluate(input) {
  const tool = input?.tool_name
  if (!HANDLED_TOOLS.has(tool)) return allow()

  const filePath = input?.tool_input?.file_path
  if (!filePath || typeof filePath !== 'string') return allow()

  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  if (!SOURCE_EXTS.has(ext)) return allow() // dados/docs/config/etc. — livre
  if (isExempt(filePath)) return allow()

  // Write → conteúdo do arquivo inteiro; Edit → o novo trecho; MultiEdit → soma
  // das linhas inseridas em todas as edições (criar muita linha em um só passo).
  let lines = 0
  if (tool === 'Write') {
    lines = linesOf(input?.tool_input?.content)
  } else if (tool === 'Edit') {
    lines = linesOf(input?.tool_input?.new_string)
  } else {
    const edits = input?.tool_input?.edits
    if (Array.isArray(edits)) lines = edits.reduce((sum, e) => sum + linesOf(e?.new_string), 0)
  }
  if (lines === 0 || lines <= THRESHOLD) return allow()

  const verb = tool === 'Write' ? 'criar' : 'inserir'
  return deny(
    `Bloqueado: tentativa de ${verb} ${lines} linhas em ${filePath} (limite ${THRESHOLD}). ` +
      `Modularize ANTES de escrever: extraia funções/módulos coesos (SRP — 1 responsabilidade por arquivo), ` +
      `aplique Clean Code + SOLID + composição. Quebre em arquivos menores (200–400 linhas típico) e tente de novo. ` +
      `Override só se justificado: CLAUDE_MAX_FILE_LINES.`,
  )
}

let data = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (c) => (data += c))
process.stdin.on('end', () => {
  try {
    evaluate(data ? JSON.parse(data) : {})
  } catch {
    allow() // fail-open
  }
})
process.stdin.on('error', () => allow())
