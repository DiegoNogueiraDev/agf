import type { SkillHandlerPort, SkillExecutionContext } from '../../tui/skill-handler-port.js'
import type { BrowserPort } from '../../tui/browser-port.js'
import { BrowserBridge } from '../../tui/browser-port.js'
import { fmtElapsed } from '../shared/handler-utils.js'
import { createLogger } from '../../core/utils/logger.js'
import { INTERACTION_SKILLS, findSkill, readSkillContent } from '../domain/browser/index.js'
import { listBrowserHelpers, showBrowserHelper, addBrowserHelper } from '../../tui/browser-workbench.js'
import { emitBrowserEvent } from '../../tui/browser-events.js'
export { listBrowserEvents } from '../../tui/browser-events.js'

const _log = createLogger({ layer: 'core', source: 'graph-browser.ts' })

const AVAILABLE_COMMANDS = [
  'info       — URL, titulo, dimensoes da pagina ativa',
  'screenshot — captura PNG do viewport atual',
  'goto       — navega para URL: /browser goto <url>',
  'click      — clique em coordenadas: /browser click <x> <y>',
  'type       — digita texto: /browser type <text>',
  'eval       — executa JS: /browser eval <expression>',
  'tabs       — lista abas abertas',
  'tab        — troca de aba: /browser tab <id>',
  'new-tab    — abre nova aba: /browser new-tab [url]',
  'close      — fecha aba: /browser close [id]',
  'status     — estado do daemon + pagina ativa',
  'fill       — preenche input: /browser fill <sel> <text>',
  'key        — pressiona tecla: /browser key <Enter|Tab|...>',
  'scroll     — scroll: /browser scroll [up|down]',
  'wait       — espera elemento: /browser wait [selector]',
  'upload     — upload de arquivo: /browser upload <sel> <path>',
  'fetch      — HTTP GET: /browser fetch <url>',
  'remote     — browser cloud: /browser remote <start|stop>',
  'profiles   — lista profiles cloud/locais',
  'doctor     — diagnostico do ambiente',
  'helpers    — gerencia helpers: /browser helpers list|add|show',
]

const COMMAND_MAP: Record<string, string> = {
  screenshots: 'screenshot',
  navigate: 'goto',
  open: 'goto',
  newtab: 'new-tab',
  list: 'tabs',
}

function resolveAlias(cmd: string): string {
  return COMMAND_MAP[cmd] ?? cmd
}

/** Parse "/browser info" → { action: "info", args: "" } */
function parseArgs(input: string): { action: string; args: string } {
  const trimmed = input.trim()
  if (!trimmed) return { action: '', args: '' }
  const space = trimmed.indexOf(' ')
  if (space === -1) return { action: resolveAlias(trimmed.toLowerCase()), args: '' }
  return { action: resolveAlias(trimmed.slice(0, space).toLowerCase()), args: trimmed.slice(space + 1).trim() }
}

export class BrowserHandler implements SkillHandlerPort {
  private bridge: BrowserPort

  private sessionId: string
  private static sessionCounter = 0

  constructor(bridge?: BrowserPort) {
    this.bridge = bridge ?? new BrowserBridge()
    this.sessionId = `br-${(BrowserHandler.sessionCounter++).toString(36)}-${Date.now().toString(36)}`
  }

  async execute(input: string, ctx: SkillExecutionContext): Promise<string> {
    const { onProgress } = ctx
    const startMs = Date.now()
    const lines: string[] = ['═ /browser ═']

    const { action, args } = parseArgs(input)

    if (!action) {
      lines.push('')
      lines.push('Uso: /browser <subcomando> [args]')
      lines.push('')
      for (const cmd of AVAILABLE_COMMANDS) lines.push(`  ${cmd}`)
      lines.push('')
      lines.push('Dica: use /browser help para skills de interacao.')
      lines.push(`═ ${fmtElapsed(Date.now() - startMs)} ═`)
      return lines.join('\n')
    }

    if (action === 'help') {
      return this.handleHelp(args, lines, startMs)
    }

    if (action === 'helpers') {
      return this.handleHelpers(args, lines, startMs)
    }

    onProgress({ step: 1, total: 2, label: `Browser ${action}...`, elapsedMs: Date.now() - startMs, tokensUsed: 0 })

    const ts = Date.now()
    const output = await this.bridge.browser(action, args)
    const durationMs = Date.now() - ts

    emitBrowserEvent({ action, args, result: output.slice(0, 200), durationMs, sessionId: this.sessionId })

    onProgress({ step: 2, total: 2, label: 'Formatando resultado...', elapsedMs: Date.now() - startMs, tokensUsed: 0 })

    if (output.startsWith('[browser-harness]')) {
      lines.push(`  ${output}`)
    } else if (output.startsWith('{') || output.startsWith('[')) {
      try {
        const parsed = JSON.parse(output)
        lines.push(formatJson(parsed))
      } catch {
        lines.push(`  ${output}`)
      }
    } else {
      lines.push(`  ${output}`)
    }

    const stats = this.bridge.getStats()
    lines.push('')
    lines.push(`Cache: ${stats.hits} hits · ${stats.misses} misses · ${stats.size} entries`)
    lines.push(`═ ${fmtElapsed(Date.now() - startMs)} ═`)
    return lines.join('\n')
  }

  private handleHelp(skillName: string, lines: string[], startMs: number): string {
    if (!skillName) {
      lines.push('')
      lines.push('Interacao skills disponiveis:')
      lines.push('')
      for (const s of INTERACTION_SKILLS) {
        lines.push(`  ${s.name.padEnd(24)} ${s.desc}`)
      }
      lines.push('')
      lines.push('Use /browser help <skill> para detalhes.')
      lines.push(`═ ${fmtElapsed(Date.now() - startMs)} ═`)
      return lines.join('\n')
    }

    const skill = findSkill(skillName)
    if (skill) {
      const content = readSkillContent(skill)
      lines.push('')
      lines.push(`=== ${skill.title} ===`)
      lines.push(content)
      lines.push(`═ ${fmtElapsed(Date.now() - startMs)} ═`)
      return lines.join('\n')
    }

    const similar = INTERACTION_SKILLS.filter((s) => s.name.includes(skillName) || skillName.includes(s.name)).map(
      (s) => s.name,
    )
    if (similar.length > 0) {
      lines.push(`  Skill "${skillName}" nao encontrada. Skills similares: ${similar.join(', ')}`)
    } else {
      lines.push(`  Skill "${skillName}" nao encontrada. Use /browser help para listar todas.`)
    }
    lines.push(`═ ${fmtElapsed(Date.now() - startMs)} ═`)
    return lines.join('\n')
  }

  private handleHelpers(args: string, lines: string[], startMs: number): string {
    const trimmed = args.trim()
    if (!trimmed || trimmed === 'list') {
      const helpers = listBrowserHelpers()
      if (helpers.length === 0) {
        lines.push('  Nenhum helper registrado.')
      } else {
        lines.push('')
        for (const h of helpers) {
          lines.push(`  ${h.name}`)
        }
      }
      lines.push(`═ ${fmtElapsed(Date.now() - startMs)} ═`)
      return lines.join('\n')
    }

    if (trimmed.startsWith('show ')) {
      const name = trimmed.slice(5).trim()
      const helper = showBrowserHelper(name)
      if (!helper) {
        lines.push(`  Helper "${name}" nao encontrado.`)
      } else {
        lines.push('')
        lines.push(`=== ${helper.name} ===`)
        lines.push(helper.source)
      }
      lines.push(`═ ${fmtElapsed(Date.now() - startMs)} ═`)
      return lines.join('\n')
    }

    if (trimmed.startsWith('add ')) {
      const rest = trimmed.slice(4).trim()
      const space = rest.indexOf(' ')
      if (space === -1) {
        lines.push('  Uso: /browser helpers add <name> <source_code>')
        lines.push(`═ ${fmtElapsed(Date.now() - startMs)} ═`)
        return lines.join('\n')
      }
      const name = rest.slice(0, space).trim()
      const source = rest.slice(space + 1).trim()
      const result = addBrowserHelper(name, source)
      if (result.ok) {
        lines.push(`  Helper "${name}" registrado com sucesso.`)
      } else {
        lines.push(`  Erro: ${result.error}`)
      }
      lines.push(`═ ${fmtElapsed(Date.now() - startMs)} ═`)
      return lines.join('\n')
    }

    lines.push(`  Uso: /browser helpers list|add <name> <code>|show <name>`)
    lines.push(`═ ${fmtElapsed(Date.now() - startMs)} ═`)
    return lines.join('\n')
  }
}

function formatJson(data: unknown, indent = 0): string {
  const pad = '  '.repeat(indent)
  if (Array.isArray(data)) {
    if (data.length === 0) return `${pad}[]`
    return data.map((item) => formatJson(item, indent)).join('\n')
  }
  if (data !== null && typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>)
    if (entries.length === 0) return `${pad}{}`
    return entries
      .map(([k, v]) => {
        if (typeof v === 'string') return `${pad}  ${k}: ${v}`
        if (typeof v === 'number' || typeof v === 'boolean') return `${pad}  ${k}: ${v}`
        if (v === null) return `${pad}  ${k}: null`
        return `${pad}  ${k}: ${JSON.stringify(v)}`
      })
      .join('\n')
  }
  return `${pad}${String(data)}`
}
