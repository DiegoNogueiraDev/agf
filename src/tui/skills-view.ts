/*!
 * skills-view — pure formatter for /skills phase-filtered browser view.
 *
 * WHY: dispatch-ports emits a flat list; this formats it with grouping for
 * the no-arg case and filtering for the phase-arg case. Pure, no Ink imports.
 *
 * Composes with: dispatch-ports.ts (consumer for 'skills' case).
 */

export interface SkillEntry {
  name: string
  desc: string
  category: string
}

/**
 * Formats a skill list for terminal display.
 * - With phase: shows only matching skills, flat.
 * - Without phase: groups by category with headers.
 */
export function formatSkillsList(skills: SkillEntry[], phase?: string): string {
  if (phase) {
    const filtered = skills.filter((s) => s.category.toUpperCase() === phase.toUpperCase())
    if (filtered.length === 0) return `Nenhuma skill encontrada na fase "${phase}".`
    return filtered.map((s) => `  ${s.name} — ${s.desc}`).join('\n')
  }

  if (skills.length === 0) return 'Nenhuma skill encontrada.'

  // Group by category
  const byCategory = new Map<string, SkillEntry[]>()
  for (const s of skills) {
    const key = s.category || 'other'
    const group = byCategory.get(key) ?? []
    group.push(s)
    byCategory.set(key, group)
  }

  const lines: string[] = []
  for (const [cat, entries] of byCategory) {
    lines.push(`\n── ${cat} ──`)
    for (const e of entries) {
      lines.push(`  ${e.name} — ${e.desc}`)
    }
  }
  return lines.join('\n').trimStart()
}
