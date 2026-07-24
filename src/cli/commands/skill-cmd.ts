/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import {
  listSkills,
  invokeSkill,
  defaultSkillRoots,
  resolveSkillsDestination,
} from '../../core/skills/skill-registry.js'
import { detectActiveCLI } from '../../core/cli-provider/cli-provider.js'
import { AgentSourceSchema } from '../../core/hooks/config-loader.js'
import { proposeSkillFromTrajectory } from '../../core/skills/auto-skill-proposer.js'
import { analyzeTrajectory } from '../../core/skills/trajectory-analyzer.js'
import { getBuiltInSkills, getSkillsByPhase } from '../../core/skills/built-in-skills.js'
import { isValidSkillName } from '../../core/skills/skill-scaffolder.js'
import { createCustomSkill, setSkillEnabled } from '../../core/skills/skill-store.js'
import { createDiscoveryEngine } from '../../core/skills/skill-discovery.js'
import { MarketplaceRegistry, DEFAULT_SKILL_SOURCE, MARKETPLACE_CACHE_DIR } from '../../core/marketplace/marketplace.js'
import { buildInstallPlan, assessInstallTarget, writeProvenance } from '../../core/marketplace/marketplace-cli.js'
import { ValidationError } from '../../core/utils/errors.js'
import type { LifecyclePhase } from '../../core/planner/lifecycle-phase-types.js'
import { openStoreOrFail } from '../open-store.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'
import type { SqliteStore } from '../../core/store/sqlite-store.js'
import type { GraphNode, XpSize } from '../../core/graph/graph-types.js'
import { resolveSkillNewDestination } from '../../core/skills/skill-new-destination.js'

const log = createLogger({ layer: 'cli', source: 'skill-cmd.ts' })

const XP_MINUTES: Record<XpSize, number> = { XS: 30, S: 60, M: 180, L: 480, XL: 960 }
const DEFAULT_ESTIMATE_MINUTES = 60

/** Real cycle time (in_progress → done) for one task, from node_changelog. Zero if unavailable. */
function computeRealCycleTimeMs(store: SqliteStore, taskId: string): number {
  const rows = store
    .getDb()
    .prepare(
      `SELECT new_value, changed_at FROM node_changelog
       WHERE node_id = ? AND field = 'status' AND new_value IN ('in_progress', 'done')
       ORDER BY changed_at ASC`,
    )
    .all(taskId) as Array<{ new_value: string; changed_at: string }>

  let inProgressAt: string | undefined
  let doneAt: string | undefined
  for (const row of rows) {
    if (row.new_value === 'in_progress' && !inProgressAt) inProgressAt = row.changed_at
    if (row.new_value === 'done') doneAt = row.changed_at
  }
  if (!inProgressAt || !doneAt) return 0
  const ms = new Date(doneAt).getTime() - new Date(inProgressAt).getTime()
  return ms > 0 ? ms : 0
}

/** Resolve a task's estimate in minutes from its own xpSize/estimateMinutes fields. */
function resolveRealEstimateMinutes(node: GraphNode): number {
  if (node.estimateMinutes != null && node.estimateMinutes > 0) return node.estimateMinutes
  if (node.xpSize && XP_MINUTES[node.xpSize]) return XP_MINUTES[node.xpSize]
  return DEFAULT_ESTIMATE_MINUTES
}

/** True when any 'decision' node is connected to this task via a real edge (ADR proxy). */
function hasRelatedDecisionNode(store: SqliteStore, taskId: string): boolean {
  const doc = store.toGraphDocument()
  const decisionIds = new Set(doc.nodes.filter((n) => n.type === 'decision').map((n) => n.id))
  if (decisionIds.size === 0) return false
  return doc.edges.some(
    (e) => (e.from === taskId && decisionIds.has(e.to)) || (e.to === taskId && decisionIds.has(e.from)),
  )
}

export interface ScaffoldResult {
  ok: boolean
  path?: string
  code?: string
  error?: string
}

/**
 * Pure function: scaffold a SKILL.md in `<dir>/<name>/SKILL.md`.
 * Returns EXISTS if the skill dir already exists (fail-safe, no overwrite).
 */
export function scaffoldSkill(name: string, dir: string): ScaffoldResult {
  // node_wire_8416c7ac5606 — skill-scaffolder wire. isValidSkillName was
  // previously dormant; this closes a real gap (any string was silently
  // accepted as a directory name, including ones with spaces).
  if (!isValidSkillName(name)) {
    return {
      ok: false,
      code: 'INVALID_NAME',
      error: `Nome de skill inválido: '${name}' (use lowercase, alfanumérico, hífens — ex: my-skill-name)`,
    }
  }
  const skillDir = join(dir, name)
  if (existsSync(skillDir)) {
    return { ok: false, code: 'EXISTS', error: `Skill '${name}' already exists at ${skillDir}` }
  }
  mkdirSync(skillDir, { recursive: true })
  const skillPath = join(skillDir, 'SKILL.md')
  const content = `---
name: ${name}
description: <fill: one-line description of what this skill does>
---

# ${name}

<Fill in the skill instructions here.>
`
  writeFileSync(skillPath, content, 'utf8')
  return { ok: true, path: skillPath }
}

/** Builds the `agf skill` CLI command (Commander definition). */
export function skillCommand(): Command {
  log.info('skill command registered')
  const cmd = new Command('skill').description('Lista e exibe skills (instruções para agentes)')

  cmd
    .command('list')
    .description('Lista as skills disponíveis (src/skills, .agents/skills, .claude/skills)')
    .option('-p, --phase <fase>', 'Ordena/filtra pela fase do ciclo (ANALYZE, IMPLEMENT, …)')
    .option('-d, --dir <dir>', 'Raiz do projeto', process.cwd())
    .option('--built-in', 'Inclui as 54 skills built-in (definidas em código, sem I/O de disco)', false)
    .action((opts: { phase?: string; dir: string; builtIn: boolean }) => {
      const out = createCliOutput('skill-list')
      const seen = new Set<string>()
      const results: { name: string; category: string; description: string }[] = []
      for (const root of defaultSkillRoots(opts.dir)) {
        const { skills } = listSkills(root, opts.phase)
        for (const s of skills) {
          if (seen.has(s.name)) continue
          seen.add(s.name)
          results.push({ name: s.name, category: s.category, description: s.description })
        }
      }
      if (opts.builtIn) {
        const builtIns = opts.phase ? getSkillsByPhase(opts.phase as LifecyclePhase) : [...getBuiltInSkills()]
        for (const s of builtIns) {
          if (seen.has(s.name)) continue
          seen.add(s.name)
          results.push({ name: s.name, category: s.category, description: s.description })
        }
      }
      out.ok({ skills: results, count: results.length })
    })

  cmd
    .command('show <nome>')
    .description('Imprime as instruções completas de uma skill')
    .option('-d, --dir <dir>', 'Raiz do projeto', process.cwd())
    .action((nome: string, opts: { dir: string }) => {
      const out = createCliOutput('skill-show')
      for (const root of defaultSkillRoots(opts.dir)) {
        const found = invokeSkill(root, nome)
        if (found) {
          out.ok({
            name: found.name,
            category: found.category,
            description: found.description,
            phases: found.phases,
            body: found.body,
          })
          return
        }
      }
      out.err('NOT_FOUND', `Skill não encontrada: ${nome}. Tente 'skill list'.`)
    })

  cmd
    .command('new <nome>')
    .description('Scaffold um SKILL.md numa raiz que o `skill list` varre (--dir = raiz; --dest p/ caminho explícito)')
    // `--dir` é a RAIZ DO PROJETO, o mesmo sentido que tem em `skill list` e nos
    // demais comandos. Antes significava destino, e criar+listar com a mesma
    // raiz devolvia lista vazia (node_a287463cb115).
    .option('-d, --dir <dir>', 'Raiz do projeto', process.cwd())
    .option('--dest <dir>', 'Diretório de destino explícito (fora da resolução automática)')
    .action((nome: string, opts: { dir: string; dest?: string }) => {
      const out = createCliOutput('skill-new')
      const target = resolveSkillNewDestination({ dir: opts.dir, dest: opts.dest })
      const result = scaffoldSkill(nome, target.destination)
      if (result.ok) {
        out.ok({
          name: nome,
          path: result.path,
          ...(target.warning ? { warning: target.warning } : {}),
        })
      } else {
        out.fail(result.code ?? 'SCAFFOLD_ERROR', result.error ?? 'Unknown error', null)
      }
    })

  cmd
    .command('propose <taskId>')
    .description('Gera um draft de skill a partir da trajetória de uma task concluída (nunca publica direto)')
    .option('-d, --dir <dir>', 'Diretório do projeto agf', process.cwd())
    .option('--summary <text>', 'Resumo do que a task ensinou (obrigatório sem --auto)')
    .option('--reason <text>', 'Motivo de trigger (repetível)', (val: string, acc: string[]) => [...acc, val], [])
    .option(
      '--auto',
      'Computa reasons automaticamente via trajectory-analyzer (cycle-time real, ADR relacionado, padrão no summary)',
      false,
    )
    .action((taskId: string, opts: { dir: string; summary?: string; reason: string[]; auto: boolean }) => {
      const out = createCliOutput('skill-propose')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const task = store.getNodeById(taskId)
        if (!task) {
          out.err('NOT_FOUND', `Task não encontrada: ${taskId}`)
          return
        }

        let summary = opts.summary
        let reasons = opts.reason

        if (opts.auto) {
          summary = summary ?? task.description ?? task.title
          const analysis = analyzeTrajectory({
            cycleTimeMs: computeRealCycleTimeMs(store, taskId),
            estimateMinutes: resolveRealEstimateMinutes(task),
            adrCreated: hasRelatedDecisionNode(store, taskId),
            summary,
          })
          if (!analysis.shouldPropose) {
            out.ok({ shouldPropose: false })
            return
          }
          reasons = analysis.reasons
        }

        if (!summary) {
          out.err('MISSING_SUMMARY', '--summary é obrigatório quando --auto não é usado.')
          return
        }

        const proposal = proposeSkillFromTrajectory({
          taskId,
          taskTitle: task.title,
          taskDescription: task.description ?? '',
          summary,
          reasons,
        })
        const draftsDir = join(opts.dir, 'workflow-graph', 'skill-drafts')
        mkdirSync(draftsDir, { recursive: true })
        const draftPath = join(draftsDir, `${proposal.domain}-${proposal.topic}.md`)
        writeFileSync(draftPath, proposal.draft, 'utf8')
        out.ok({ domain: proposal.domain, topic: proposal.topic, confidence: proposal.confidence, draftPath })
      } finally {
        store.close()
      }
    })

  cmd
    .command('create')
    .description('Cria uma custom skill persistida no grafo (project-scoped, SQLite)')
    .requiredOption('--name <nome>', 'Nome único da skill (dentro do projeto)')
    .requiredOption('--description <texto>', 'Descrição curta')
    .requiredOption(
      '--phase <fase>',
      'Fase do ciclo em que a skill se aplica (repetível)',
      (val: string, acc: string[]) => [...acc, val],
      [],
    )
    .requiredOption('--instructions <texto>', 'Instruções completas da skill')
    .option('--category <cat>', 'Categoria', 'know-me')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action(
      (opts: {
        name: string
        description: string
        phase: string[]
        instructions: string
        category: string
        dir: string
      }) => {
        const out = createCliOutput('skill-create')
        const store = openStoreOrFail(opts.dir, { requireExisting: true })
        try {
          const project = store.getActiveProject()
          if (!project) {
            out.err('NO_PROJECT', 'Nenhum projeto ativo no grafo.')
            return
          }
          const skill = createCustomSkill(store.getDb(), project.id, {
            name: opts.name,
            description: opts.description,
            category: opts.category,
            phases: opts.phase as never,
            instructions: opts.instructions,
          })
          out.ok({ id: skill.id, name: skill.name })
        } catch (err) {
          out.err(err instanceof ValidationError ? 'VALIDATION_ERROR' : 'CREATE_FAILED', (err as Error).message)
        } finally {
          store.close()
        }
      },
    )

  cmd
    .command('install <nome>')
    .description('Instala uma skill de um repositório git no diretório de skills da sua CLI')
    .option('--source <url>', 'URL git do repositório de skills (default: repositório público oficial)')
    .option('--ref <ref>', 'Branch/tag/commit a usar', 'HEAD')
    .option('--dest <dir>', 'Diretório de destino (default: o da CLI detectada)')
    .option('--cli <id>', 'CLI alvo (claude, codex, opencode, copilot, gemini, cursor…)')
    .option('--force', 'Sobrescreve mesmo se a skill foi editada localmente', false)
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action(
      async (
        nome: string,
        opts: { source: string; ref: string; dest?: string; cli?: string; force: boolean; dir: string },
      ) => {
        const out = createCliOutput('skill-install')
        // Destination comes from the CLI actually driving, so the skill lands where
        // that CLI reads. An explicit --dest wins; an undetectable CLI refuses rather
        // than guessing, because a silent default installs into a folder nothing loads.
        let dest = opts.dest
        if (!dest) {
          const requested = opts.cli ? AgentSourceSchema.safeParse(opts.cli) : undefined
          if (requested && !requested.success) {
            out.err('CLI_UNKNOWN', `CLI não reconhecida: ${opts.cli}`)
            return
          }
          const cli = requested?.data ?? detectActiveCLI()?.source ?? 'unknown'
          const resolved = resolveSkillsDestination(cli, opts.dir)
          if (!resolved.ok) {
            out.err(resolved.code, `${resolved.error} (use --cli <id> ou --dest <dir>)`)
            return
          }
          dest = resolved.dir
        }
        try {
          // ONE cache root shared with `marketplace add/list`, so a source the user
          // registered is visible to the command that installs.
          const registry = new MarketplaceRegistry({ rootCacheDir: join(opts.dir, MARKETPLACE_CACHE_DIR) })
          // No --source means the published repository: requiring a URL would limit
          // installs to people who already know where the skills live. It is refreshed
          // on every run, so an install always reflects the source's current state.
          const sourceUrl = opts.source ?? DEFAULT_SKILL_SOURCE
          const { source } = await registry.addSource(sourceUrl, { ref: opts.ref })
          // Search EVERY registered source, not just the one just refreshed — that is
          // what makes a duplicate name across sources detectable instead of silently
          // resolved in favour of whichever was fetched last.
          const allItems = registry.list().flatMap((s) => registry.getItems(s.id))
          const sourceRoots = new Map(registry.list().map((s) => [s.id, s.cacheDir]))
          if (!sourceRoots.has(source.id)) sourceRoots.set(source.id, source.cacheDir)
          const plan = buildInstallPlan(allItems, nome, dest, sourceRoots)
          if (!plan.ok) {
            out.err(plan.code, plan.error)
            return
          }
          // Assess BEFORE writing: the destination is the user's own skills folder,
          // where a hand-edited skill has no git to recover from.
          const skillDir = join(dest, plan.skill)
          const verdict = assessInstallTarget(skillDir, { force: opts.force })
          if (!verdict.ok) {
            out.err(verdict.code, `${verdict.error} (use --force para sobrescrever)`)
            return
          }
          for (const copy of plan.copies) {
            mkdirSync(dirname(copy.to), { recursive: true })
            writeFileSync(copy.to, readFileSync(copy.from, 'utf8'), 'utf8')
          }
          writeProvenance(
            skillDir,
            plan.copies.map((c) => relative(skillDir, c.to)),
          )
          out.ok({ skill: plan.skill, dest, action: verdict.action, files: plan.copies.map((c) => c.to) })
        } catch (err) {
          // Name the source that failed — with a built-in default the user may not
          // even know which URL was tried.
          const detail = err instanceof Error ? err.message : String(err)
          out.err('INSTALL_FAILED', `${detail} (source: ${opts.source ?? DEFAULT_SKILL_SOURCE})`)
        }
      },
    )

  cmd
    .command('discover <url>')
    .description(
      '3-tier skill discovery para uma página (workspace + domain skills persistidas + sinais de interação do HTML)',
    )
    .requiredOption('--html-file <path>', 'Caminho de um arquivo HTML da página a analisar')
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((url: string, opts: { htmlFile: string; dir: string }) => {
      const out = createCliOutput('skill-discover')
      if (!existsSync(opts.htmlFile)) {
        out.err('NOT_FOUND', `--html-file não encontrado: ${opts.htmlFile}`)
        return
      }
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const html = readFileSync(opts.htmlFile, 'utf8')
        const engine = createDiscoveryEngine(store, opts.dir)
        const result = engine.resolve(url, html)
        out.ok(result)
      } finally {
        store.close()
      }
    })

  for (const [subcmd, enabled] of [
    ['enable', true],
    ['disable', false],
  ] as const) {
    cmd
      .command(`${subcmd} <nome>`)
      .description(`${subcmd === 'enable' ? 'Ativa' : 'Desativa'} uma skill para o projeto atual`)
      .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
      .action((nome: string, opts: { dir: string }) => {
        const out = createCliOutput(`skill-${subcmd}`)
        const store = openStoreOrFail(opts.dir, { requireExisting: true })
        try {
          const project = store.getActiveProject()
          if (!project) {
            out.err('NO_PROJECT', 'Nenhum projeto ativo no grafo.')
            return
          }
          setSkillEnabled(store.getDb(), project.id, nome, enabled)
          out.ok({ name: nome, enabled })
        } finally {
          store.close()
        }
      })
  }

  return cmd
}
