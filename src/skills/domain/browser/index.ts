import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createLogger } from '../../../core/utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'skills/domain/browser' })

const _dirname = dirname(fileURLToPath(import.meta.url))

export interface InteractionSkill {
  name: string
  title: string
  desc: string
  file: string
}

export const INTERACTION_SKILLS: InteractionSkill[] = [
  { name: 'connection', title: 'Connection', desc: 'Browser connection setup and lifecycle', file: 'connection.md' },
  { name: 'cookies', title: 'Cookies', desc: 'Cookie management, reading, setting, clearing', file: 'cookies.md' },
  {
    name: 'cross-origin-iframes',
    title: 'Cross-Origin Iframes',
    desc: 'Working with cross-origin iframe content',
    file: 'cross-origin-iframes.md',
  },
  { name: 'dialogs', title: 'Dialogs', desc: 'Alert, confirm, prompt, beforeunload handling', file: 'dialogs.md' },
  { name: 'downloads', title: 'Downloads', desc: 'File download detection and management', file: 'downloads.md' },
  { name: 'drag-and-drop', title: 'Drag & Drop', desc: 'HTML5 drag-and-drop automation', file: 'drag-and-drop.md' },
  { name: 'dropdowns', title: 'Dropdowns', desc: 'Select, custom dropdown, combobox handling', file: 'dropdowns.md' },
  { name: 'iframes', title: 'Iframes', desc: 'Same-origin iframe content access', file: 'iframes.md' },
  {
    name: 'network-requests',
    title: 'Network Requests',
    desc: 'Intercepting and inspecting network traffic',
    file: 'network-requests.md',
  },
  { name: 'print-as-pdf', title: 'Print as PDF', desc: 'Page-to-PDF conversion via CDP', file: 'print-as-pdf.md' },
  { name: 'profile-sync', title: 'Profile Sync', desc: 'Local-to-cloud profile cookie sync', file: 'profile-sync.md' },
  {
    name: 'screenshots',
    title: 'Screenshots',
    desc: 'Viewport and full-page screenshot capture',
    file: 'screenshots.md',
  },
  { name: 'scrolling', title: 'Scrolling', desc: 'Page scroll techniques and detection', file: 'scrolling.md' },
  { name: 'shadow-dom', title: 'Shadow DOM', desc: 'Accessing and interacting with shadow DOM', file: 'shadow-dom.md' },
  { name: 'tabs', title: 'Tabs', desc: 'Tab lifecycle management', file: 'tabs.md' },
  { name: 'uploads', title: 'Uploads', desc: 'File input and drag-and-drop upload', file: 'uploads.md' },
  { name: 'viewport', title: 'Viewport', desc: 'Viewport size, DPR, and responsive testing', file: 'viewport.md' },
]

/** Looks up a browser interaction skill by exact name or prefix match. */
export function findSkill(name: string): InteractionSkill | undefined {
  return INTERACTION_SKILLS.find((s) => s.name === name || s.name.startsWith(name))
}

/** Reads and returns the raw markdown content of a browser interaction skill from disk. */
export function readSkillContent(skill: InteractionSkill): string {
  const p = join(_dirname, skill.file)
  try {
    return readFileSync(p, 'utf-8')
  } catch {
    return `# ${skill.title}\n\nContent not found.`
  }
}
