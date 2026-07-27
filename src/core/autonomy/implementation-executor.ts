/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Executor de implementação — fecha o loop autônomo (M1e). Recebe um plano
 * ESTRUTURADO e o aplica no workspace de forma determinística, depois roda os
 * testes. Dois mecanismos de aplicação:
 *
 * - `files[]` — escrita de arquivo inteiro (simples, auditável); usado p/
 *   arquivos novos grandes.
 * - `edits[]` — edições cirúrgicas search/replace (M1k): o modelo emite só as
 *   regiões alteradas → corte brutal de tokens de SAÍDA. (Técnica adaptada do
 *   opencode, MIT — reimplementada nas convenções deste repo.)
 *
 * Guard de path-traversal: nenhum caminho (file ou edit) escapa do workspace.
 * O runner de comando é injetável (`runCommand`) — testável sem spawnar
 * processos; o default usa execução real do shell.
 */
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { McpGraphError } from '../utils/errors.js'
import { createLogger } from '../utils/logger.js'
import { ExecPolicyEngine } from '../security/exec-policy-engine.js'
import type { ExecPolicyRule } from '../../schemas/exec-policy.schema.js'

const log = createLogger({ layer: 'core', source: 'implementation-executor.ts' })

// node_wire_8da185015125 — exec-policy-engine wire. Conservative default
// ruleset: blocks obviously destructive patterns before they ever reach a
// real shell. Anything not matched falls through unchanged (no Allow-list —
// this is a blocklist, not a sandbox).
const DEFAULT_EXEC_RULES: ExecPolicyRule[] = [
  {
    type: 'regex',
    value: '\\brm\\s+(-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*|-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*)\\s+/(\\s|$)',
    decision: 'Forbidden',
    justification: 'rm -rf on filesystem root',
  },
  {
    type: 'regex',
    value: '\\|\\s*(bash|sh|zsh)\\b',
    decision: 'Forbidden',
    justification: 'piping remote/generated content directly into a shell',
  },
  {
    type: 'regex',
    value: 'git\\s+push\\s+[^\\n]*--force[^\\n]*\\s(origin\\s+)?(main|master)\\b',
    decision: 'Forbidden',
    justification: 'force-push to main/master',
  },
  {
    type: 'regex',
    value: ':\\(\\)\\s*\\{\\s*:\\s*\\|\\s*:\\s*&\\s*\\}\\s*;\\s*:',
    decision: 'Forbidden',
    justification: 'fork bomb pattern',
  },
  {
    type: 'regex',
    value: '\\bdd\\s+if=/dev/(zero|random|urandom)\\s+of=/dev/[a-z]+',
    decision: 'Forbidden',
    justification: 'raw disk overwrite',
  },
]

const execPolicyEngine = new ExecPolicyEngine({ rules: DEFAULT_EXEC_RULES })

export class ExecutorError extends McpGraphError {
  constructor(message: string) {
    super(`Executor error: ${message}`)
    this.name = 'ExecutorError'
  }
}

/** `oldString` não encontrado no arquivo-alvo. */
export class EditNotFoundError extends ExecutorError {
  constructor(path: string) {
    super(`oldString não encontrado em ${path}`)
    this.name = 'EditNotFoundError'
  }
}

/** `oldString` casa em >1 lugar sem `replaceAll` — recusa para não adivinhar. */
export class EditAmbiguousError extends ExecutorError {
  constructor(path: string, count: number) {
    super(`oldString ambíguo em ${path}: ${count} ocorrências (use replaceAll)`)
    this.name = 'EditAmbiguousError'
  }
}

/** Edição (oldString não-vazio) sobre arquivo inexistente. */
export class EditTargetMissingError extends ExecutorError {
  constructor(path: string) {
    super(`Edição em arquivo inexistente: ${path} (use oldString:"" para criar)`)
    this.name = 'EditTargetMissingError'
  }
}

export interface FileWrite {
  /** Caminho relativo ao workspace (sem `..` nem absoluto). */
  path: string
  content: string
}

export interface EditOp {
  /** Caminho relativo ao workspace (sem `..` nem absoluto). */
  path: string
  /** Trecho exato a localizar. "" (vazio) = criar arquivo novo com `newString`. */
  oldString: string
  /** Texto de substituição. */
  newString: string
  /** Substitui todas as ocorrências; default false (exige match único). */
  replaceAll?: boolean
}

export interface ImplementationPlan {
  /** Escritas de arquivo inteiro (opcional; combinável com `edits`). */
  files?: FileWrite[]
  /** Edições cirúrgicas search/replace (opcional; combinável com `files`). */
  edits?: EditOp[]
  /** Comando de teste a rodar após aplicar (ex.: "npm test"). */
  testCommand?: string
}

export interface CommandResult {
  exitCode: number
  output: string
}

export type CommandRunner = (command: string, cwd: string) => CommandResult

export interface ExecuteOptions {
  workspaceDir: string
  /** Comando de teste usado quando o plano não traz um. */
  defaultTestCommand?: string
  /** Runner injetável (default: execSync real). */
  runCommand?: CommandRunner
}

export interface ExecutionResult {
  /** Caminhos efetivamente escritos (na ordem do plano). */
  applied: string[]
  /** true/false conforme o exit code; null se nenhum comando foi rodado. */
  testPassed: boolean | null
  testOutput?: string
  testExitCode?: number
}

/** Runner real (execSync). Exportado para ser envolvido pela exec-policy. */
export const defaultRunner: CommandRunner = (command, cwd) => {
  const policyResult = execPolicyEngine.check(command, cwd)
  if (policyResult?.decision === 'Forbidden') {
    const justification =
      'justification' in policyResult.rule ? (policyResult.rule as { justification?: string }).justification : ''
    return { exitCode: 1, output: `blocked by exec policy: ${justification || 'forbidden command pattern'}` }
  }

  try {
    const output = execSync(command, { cwd, encoding: 'utf8', stdio: 'pipe' })
    return { exitCode: 0, output }
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string }
    return {
      exitCode: typeof e.status === 'number' ? e.status : 1,
      output: `${e.stdout ?? ''}${e.stderr ?? ''}`,
    }
  }
}

/** Normaliza fim-de-linha CRLF→LF para casamento robusto de `oldString`. */
function normalizeEol(text: string): string {
  return text.replace(/\r\n/g, '\n')
}

/** Conta ocorrências não-sobrepostas de `needle` em `haystack`. */
function countOccurrences(haystack: string, needle: string): number {
  let count = 0
  let from = 0
  for (;;) {
    const at = haystack.indexOf(needle, from)
    if (at === -1) break
    count += 1
    from = at + needle.length
  }
  return count
}

/** Resolve um caminho dentro do workspace, rejeitando escape (traversal/absoluto). */
function safeResolve(workspaceDir: string, filePath: string): string {
  if (isAbsolute(filePath)) {
    throw new ExecutorError(`Caminho absoluto não permitido: ${filePath}`)
  }
  const root = resolve(workspaceDir)
  const target = resolve(root, filePath)
  const rel = relative(root, target)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new ExecutorError(`Caminho escapa do workspace: ${filePath}`)
  }
  return target
}

/** Aplica o plano no workspace e roda os testes (se houver comando). */
export async function executePlan(plan: ImplementationPlan, options: ExecuteOptions): Promise<ExecutionResult> {
  const files = plan.files ?? []
  const edits = plan.edits ?? []
  if (files.length === 0 && edits.length === 0) {
    throw new ExecutorError('Plano sem arquivos nem edições — nada a aplicar.')
  }

  const applied: string[] = []

  // 1) Escritas de arquivo inteiro primeiro (um edit pode mirar arquivo recém-criado).
  for (const file of files) {
    const target = safeResolve(options.workspaceDir, file.path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, file.content, 'utf8')
    applied.push(file.path)
  }

  // 2) Edições cirúrgicas (search/replace), na ordem do plano.
  for (const edit of edits) {
    const target = safeResolve(options.workspaceDir, edit.path)
    if (edit.oldString === '') {
      // oldString vazio = criar arquivo novo com newString
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, normalizeEol(edit.newString), 'utf8')
      applied.push(edit.path)
      log.info('Edição aplicada (criação)', { path: edit.path })
      continue
    }
    if (!existsSync(target)) throw new EditTargetMissingError(edit.path)
    const haystack = normalizeEol(readFileSync(target, 'utf8'))
    const needle = normalizeEol(edit.oldString)
    const occurrences = countOccurrences(haystack, needle)
    if (occurrences === 0) throw new EditNotFoundError(edit.path)
    if (occurrences > 1 && edit.replaceAll !== true) {
      throw new EditAmbiguousError(edit.path, occurrences)
    }
    // split/join evita interpretação de `$&`/`$1` do String.replace
    const next = haystack.split(needle).join(normalizeEol(edit.newString))
    writeFileSync(target, next, 'utf8')
    applied.push(edit.path)
    log.info('Edição aplicada', { path: edit.path, replaceAll: edit.replaceAll === true, occurrences })
  }

  log.info('Plano aplicado', { files: files.length, edits: edits.length, workspace: options.workspaceDir })

  const command = plan.testCommand ?? options.defaultTestCommand
  if (!command) {
    return { applied, testPassed: null }
  }

  const runner = options.runCommand ?? defaultRunner
  const result = runner(command, resolve(options.workspaceDir))
  const testPassed = result.exitCode === 0
  log.info('Testes executados', { command, exitCode: result.exitCode, testPassed })

  return {
    applied,
    testPassed,
    testOutput: result.output,
    testExitCode: result.exitCode,
  }
}

/** Diretório de trabalho fixo + caminho relativo seguro (usado fora deste módulo). */
export function resolveWorkspacePath(workspaceDir: string, filePath: string): string {
  return join(resolve(workspaceDir), relative(resolve(workspaceDir), safeResolve(workspaceDir, filePath)))
}
