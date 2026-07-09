/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { writeFileSync, existsSync, readFileSync, mkdirSync, lstatSync } from 'node:fs'
import path from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { logger } from '../core/utils/logger.js'
import { GraphNotInitializedError, McpGraphError } from '../core/utils/errors.js'
import { installLspDeps } from '../core/lsp/lsp-deps-installer.js'
import { detectProjectLanguages } from '../core/lsp/language-detector.js'
import { ServerRegistry } from '../core/lsp/server-registry.js'
import { applySection, detectProjectContext } from '../core/config/ai-memory-generator.js'
import { generateCliContext, CLI_TARGET_PATHS, type CliTarget } from '../core/spec-templates/agent-format.js'
import { loadConfig } from '../core/config/config-loader.js'
import {
  ensureClaudeIgnore,
  ensureCopilotIgnore,
  updateClaudeIgnore,
  updateCopilotIgnore,
} from '../core/config/ignore-templates.js'
import { introspectTools } from '../core/docs/tool-introspector.js'
import { introspectRoutes } from '../core/docs/route-introspector.js'
import {
  generateReadmeStats,
  generateArchToolSection,
  generateArchRouteSection,
  generateToolRefSummary,
} from '../core/docs/doc-generator.js'
import { applySectionWithName } from '../core/docs/doc-updater.js'

import { STORE_DIR } from '../core/utils/constants.js'

const GITIGNORE_ENTRY = 'workflow-graph/'

// --- Update types ---

export interface UpdateStepResult {
  step: string
  status: 'updated' | 'up-to-date' | 'created' | 'skipped' | 'error'
  message: string
}

export interface UpdateReport {
  steps: UpdateStepResult[]
  hasChanges: boolean
}

export interface UpdateOptions {
  only?: string[]
  dryRun?: boolean
  /** Reescreve os blocos gerenciados mesmo quando o conteúdo já está atualizado. */
  force?: boolean
}

// --- Internal helpers ---

function _resolveCommand(): string {
  // Check if running via npx/global — use package name
  // Check if running from node_modules — use relative path
  const binPath = process.argv[1]
  if (binPath && binPath.includes('node_modules')) {
    return 'npx'
  }
  return 'npx'
}

function _resolveArgs(): string[] {
  const binPath = process.argv[1]
  if (binPath && binPath.includes('node_modules')) {
    return ['-y', 'agent-graph-flow-mcp-server']
  }
  return ['-y', 'mcp-graph']
}

function ensureGitignore(projectDir: string, dryRun?: boolean): UpdateStepResult {
  const gitignorePath = path.join(projectDir, '.gitignore')

  if (!existsSync(gitignorePath)) {
    if (!dryRun) {
      writeFileSync(gitignorePath, GITIGNORE_ENTRY + '\n', 'utf-8')
      logger.info('.gitignore created', { entry: GITIGNORE_ENTRY })
    }
    return { step: 'gitignore', status: 'created', message: '.gitignore created with workflow-graph/' }
  }

  const content = readFileSync(gitignorePath, 'utf-8')
  if (content.includes(GITIGNORE_ENTRY)) {
    return { step: 'gitignore', status: 'up-to-date', message: '.gitignore up-to-date' }
  }

  if (!dryRun) {
    const separator = content.endsWith('\n') ? '' : '\n'
    writeFileSync(gitignorePath, content + separator + GITIGNORE_ENTRY + '\n', 'utf-8')
    logger.info('.gitignore updated', { entry: GITIGNORE_ENTRY })
  }

  return { step: 'gitignore', status: 'updated', message: '.gitignore updated with workflow-graph/' }
}

function generateAndWriteClaudeMd(
  projectDir: string,
  dryRun?: boolean,
  contextMode?: 'ultra-lean' | 'lean' | 'full',
  force?: boolean,
): UpdateStepResult {
  const projectName = path.basename(projectDir)
  const claudeMdPath = path.join(projectDir, 'CLAUDE.md')
  const projectContext = detectProjectContext(projectDir)
  const section = generateCliContext('claude', projectName, contextMode ?? 'lean', projectContext)

  const fileExists = existsSync(claudeMdPath)
  let existing = ''
  if (fileExists) {
    existing = readFileSync(claudeMdPath, 'utf-8')
  }

  const resultValue = applySection(existing, section)

  if (!force && fileExists && existing === resultValue) {
    return { step: 'claude-md', status: 'up-to-date', message: 'CLAUDE.md up-to-date' }
  }

  if (!dryRun) {
    writeFileSync(claudeMdPath, resultValue, 'utf-8')
    logger.info('CLAUDE.md updated with agent-graph-flow instructions', { path: claudeMdPath })
  }

  return {
    step: 'claude-md',
    status: fileExists ? 'updated' : 'created',
    message: fileExists ? 'CLAUDE.md updated' : 'CLAUDE.md created',
  }
}

function generateAndWriteCopilotInstructions(
  projectDir: string,
  dryRun?: boolean,
  contextMode?: 'ultra-lean' | 'lean' | 'full',
  force?: boolean,
): UpdateStepResult {
  const projectName = path.basename(projectDir)
  const githubDir = path.join(projectDir, '.github')
  const copilotPath = path.join(githubDir, 'copilot-instructions.md')
  const projectContext = detectProjectContext(projectDir)
  const section = generateCliContext('copilot', projectName, contextMode ?? 'lean', projectContext)

  const fileExists = existsSync(copilotPath)
  let existing = ''
  if (fileExists) {
    existing = readFileSync(copilotPath, 'utf-8')
  }

  const resultValue = applySection(existing, section)

  if (!force && fileExists && existing === resultValue) {
    return { step: 'copilot-md', status: 'up-to-date', message: 'copilot-instructions.md up-to-date' }
  }

  if (!dryRun) {
    mkdirSync(githubDir, { recursive: true })
    writeFileSync(copilotPath, resultValue, 'utf-8')
    logger.info('copilot-instructions.md updated', { path: copilotPath })
  }

  return {
    step: 'copilot-md',
    status: fileExists ? 'updated' : 'created',
    message: fileExists ? 'copilot-instructions.md updated' : 'copilot-instructions.md created',
  }
}

function generateAndWriteCodexAgentsMd(
  projectDir: string,
  dryRun?: boolean,
  contextMode?: 'ultra-lean' | 'lean' | 'full',
  force?: boolean,
): UpdateStepResult {
  const projectName = path.basename(projectDir)
  const agentsMdPath = path.join(projectDir, 'AGENTS.md')
  const projectContext = detectProjectContext(projectDir)
  const section = generateCliContext('codex', projectName, contextMode ?? 'lean', projectContext)

  const fileExists = existsSync(agentsMdPath)
  let existing = ''
  if (fileExists) {
    existing = readFileSync(agentsMdPath, 'utf-8')
  }

  const resultValue = applySection(existing, section)

  if (!force && fileExists && existing === resultValue) {
    return { step: 'codex-md', status: 'up-to-date', message: 'AGENTS.md up-to-date' }
  }

  if (!dryRun) {
    writeFileSync(agentsMdPath, resultValue, 'utf-8')
    logger.info('AGENTS.md updated with Codex agent-graph-flow instructions', { path: agentsMdPath })
  }

  return {
    step: 'codex-md',
    status: fileExists ? 'updated' : 'created',
    message: fileExists ? 'AGENTS.md updated' : 'AGENTS.md created',
  }
}

/**
 * Generic emitter for plain-markdown CLI rule files (Cursor / Windsurf / Gemini).
 * Same idempotent markers and CLI-first body as the other context files — zero MCP.
 */
function generateAndWriteCliRule(
  projectDir: string,
  cli: Extract<CliTarget, 'cursor' | 'windsurf' | 'gemini'>,
  dryRun?: boolean,
  contextMode?: 'ultra-lean' | 'lean' | 'full',
  force?: boolean,
): UpdateStepResult {
  const projectName = path.basename(projectDir)
  const relPath = CLI_TARGET_PATHS[cli]
  const filePath = path.join(projectDir, relPath)
  const projectContext = detectProjectContext(projectDir)
  const section = generateCliContext(cli, projectName, contextMode ?? 'lean', projectContext)

  const fileExists = existsSync(filePath)
  const existing = fileExists ? readFileSync(filePath, 'utf-8') : ''
  const resultValue = applySection(existing, section)

  if (!force && fileExists && existing === resultValue) {
    return { step: `${cli}-md`, status: 'up-to-date', message: `${relPath} up-to-date` }
  }

  if (!dryRun) {
    mkdirSync(path.dirname(filePath), { recursive: true })
    writeFileSync(filePath, resultValue, 'utf-8')
    logger.info(`${relPath} updated with agent-graph-flow instructions`, { path: filePath })
  }

  return {
    step: `${cli}-md`,
    status: fileExists ? 'updated' : 'created',
    message: fileExists ? `${relPath} updated` : `${relPath} created`,
  }
}

function initStore(projectDir: string): void {
  const storeDir = path.join(projectDir, STORE_DIR)

  if (existsSync(storeDir) && lstatSync(storeDir).isFile()) {
    throw new McpGraphError(
      `A file named workflow-graph already exists at ${storeDir}; mcp-graph expects a directory there. Move or remove it first.`,
    )
  }

  mkdirSync(storeDir, { recursive: true })

  const store = SqliteStore.open(projectDir)
  const projectName = path.basename(projectDir)
  store.initProject(projectName)
  store.close()

  logger.info('Database initialized', { dir: STORE_DIR })
}

function generateAndUpdateDocs(projectDir: string, dryRun?: boolean): UpdateStepResult {
  // Only run inside the mcp-graph source repo
  const toolsDir = path.join(projectDir, 'src', 'mcp', 'tools')
  const apiDir = path.join(projectDir, 'src', 'api')
  if (!existsSync(toolsDir) || !existsSync(apiDir)) {
    return { step: 'docs', status: 'skipped', message: 'Not inside mcp-graph repo, skipping auto-docs' }
  }

  const tools = introspectTools(toolsDir)
  const routes = introspectRoutes(apiDir)

  const targets = [
    { file: 'README.md', section: 'readme-stats', content: generateReadmeStats(tools, routes) },
    { file: 'docs/architecture/ARCHITECTURE-GUIDE.md', section: 'arch-mcp', content: generateArchToolSection(tools) },
    { file: 'docs/architecture/ARCHITECTURE-GUIDE.md', section: 'arch-api', content: generateArchRouteSection(routes) },
    { file: 'docs/reference/MCP-TOOLS-REFERENCE.md', section: 'tools-summary', content: generateToolRefSummary(tools) },
  ]

  let changed = 0
  for (const target of targets) {
    const filePath = path.join(projectDir, target.file)
    if (!existsSync(filePath)) continue

    const existing = readFileSync(filePath, 'utf-8')
    const updated = applySectionWithName(existing, target.section, target.content)

    if (existing !== updated) {
      if (!dryRun) {
        writeFileSync(filePath, updated, 'utf-8')
      }
      changed++
      logger.info(`Auto-docs: ${target.file} [${target.section}] updated`)
    }
  }

  if (changed === 0) {
    return { step: 'docs', status: 'up-to-date', message: 'All docs up-to-date' }
  }

  return {
    step: 'docs',
    status: dryRun ? 'up-to-date' : 'updated',
    message: `${changed} doc section(s) ${dryRun ? 'would be ' : ''}updated`,
  }
}

// --- Public API ---

/** runUpdate —  */
export async function runUpdate(projectDir: string, options: UpdateOptions = {}): Promise<UpdateReport> {
  const dbPath = path.join(projectDir, STORE_DIR, 'graph.db')

  if (!existsSync(dbPath)) {
    throw new GraphNotInitializedError()
  }

  const steps: UpdateStepResult[] = []
  const shouldRun = (step: string): boolean => !options.only || options.only.includes(step)

  // 1. DB migrations
  if (shouldRun('db')) {
    const store = SqliteStore.open(projectDir)
    store.close()
    steps.push({ step: 'db', status: 'up-to-date', message: 'Database migrations applied' })
  }

  // 2. Config files — CLI-first: no .mcp.json / .vscode/mcp.json (zero MCP).
  if (shouldRun('gitignore')) steps.push(ensureGitignore(projectDir, options.dryRun))

  // 3b. LSP language server dependencies
  if (shouldRun('lsp-deps')) {
    const registry = new ServerRegistry()
    const detected = detectProjectLanguages(projectDir, registry)
    const langIds = detected.map((d) => d.languageId)
    const lspResults = await installLspDeps(langIds)
    const available = lspResults.filter((r) => r.status === 'already_available')
    const missing = lspResults.filter((r) => r.status === 'not_found')
    const hints = missing.map((r) => `${r.languageId}: ${r.installHint ?? r.message}`).join('; ')
    steps.push({
      step: 'lsp-deps',
      status: missing.length === 0 ? 'up-to-date' : 'updated',
      message: `LSP servers: ${available.length}/${lspResults.length} available${missing.length > 0 ? `. Missing: ${hints}` : ''}`,
    })
  }

  // 4. AI instruction files
  const config = loadConfig(projectDir)
  const ctxMode = config.contextMode
  const force = options.force
  if (shouldRun('claude-md')) steps.push(generateAndWriteClaudeMd(projectDir, options.dryRun, ctxMode, force))
  if (shouldRun('copilot-md'))
    steps.push(generateAndWriteCopilotInstructions(projectDir, options.dryRun, ctxMode, force))
  if (shouldRun('codex-md')) steps.push(generateAndWriteCodexAgentsMd(projectDir, options.dryRun, ctxMode, force))
  if (shouldRun('cursor-md')) steps.push(generateAndWriteCliRule(projectDir, 'cursor', options.dryRun, ctxMode, force))
  if (shouldRun('windsurf-md'))
    steps.push(generateAndWriteCliRule(projectDir, 'windsurf', options.dryRun, ctxMode, force))
  if (shouldRun('gemini-md')) steps.push(generateAndWriteCliRule(projectDir, 'gemini', options.dryRun, ctxMode, force))

  // 5. Ignore files — always rewrite to match latest template so
  // template improvements reach existing projects on `update`.
  if (shouldRun('ignore-files')) {
    const claudeResult = updateClaudeIgnore(projectDir, options.dryRun)
    steps.push({ step: 'ignore-files', status: claudeResult.status, message: claudeResult.message })
    const copilotResult = updateCopilotIgnore(projectDir, options.dryRun)
    steps.push({ step: 'ignore-files', status: copilotResult.status, message: copilotResult.message })
  }

  // 6. Auto-docs (only inside mcp-graph repo)
  if (shouldRun('docs')) {
    steps.push(generateAndUpdateDocs(projectDir, options.dryRun))
  }

  const report: UpdateReport = {
    steps,
    hasChanges: steps.some((s) => s.status === 'updated' || s.status === 'created'),
  }

  logger.info('mcp-graph update complete', {
    updated: steps.filter((s) => s.status === 'updated').length,
    upToDate: steps.filter((s) => s.status === 'up-to-date').length,
  })

  return report
}

/** runInit —  */
export async function runInit(projectDir: string): Promise<void> {
  logger.info('mcp-graph init', { dir: projectDir })

  initStore(projectDir)
  // CLI-first: no .mcp.json / .vscode/mcp.json emission (zero MCP).
  ensureGitignore(projectDir)

  // Register test execution strategy files (three-tier model → .claude/rules/tests.md)
  const { registerTestsRules } = await import('../core/tests-rules/tests-rules-atomic.js')
  const { hasVitest, initVitestSmokeConfig, mergeVitestScripts } =
    await import('../core/tests-rules/vitest-scaffold-atomic.js')
  registerTestsRules(projectDir)
  if (hasVitest(projectDir)) {
    await initVitestSmokeConfig(projectDir)
    await mergeVitestScripts(projectDir)
  }

  // Generate AI instruction files (idempotent)
  const initConfig = loadConfig(projectDir)
  generateAndWriteClaudeMd(projectDir, undefined, initConfig.contextMode)
  generateAndWriteCopilotInstructions(projectDir, undefined, initConfig.contextMode)
  generateAndWriteCodexAgentsMd(projectDir, undefined, initConfig.contextMode)
  generateAndWriteCliRule(projectDir, 'cursor', undefined, initConfig.contextMode)
  generateAndWriteCliRule(projectDir, 'windsurf', undefined, initConfig.contextMode)
  generateAndWriteCliRule(projectDir, 'gemini', undefined, initConfig.contextMode)

  // Generate ignore files (does NOT overwrite existing)
  ensureClaudeIgnore(projectDir)
  ensureCopilotIgnore(projectDir)

  logger.success('mcp-graph initialized', {
    dir: projectDir,
    store: STORE_DIR,
  })
}
