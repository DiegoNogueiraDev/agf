/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * SlashCommandRegistry — generic, type-parameterized command registry with
 * decorator-based registration, aliases, and fuzzy matching integration.
 * Reusable for any slash command system.
 */

export { parseCommand, resolveAlias, fuzzyFilter, type SlashCommand } from '../../tui/dispatch.js'
export type { ParsedCommand } from '../../tui/dispatch.js'
import { createLogger } from '../../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'tui/slash/command-registry.ts' })

export interface SlashCommandHandler {
  name: string
  execute(...args: string[]): unknown
}

type ClassConstructor<T extends SlashCommandHandler = SlashCommandHandler> = new (...args: unknown[]) => T

interface CommandEntry<T extends SlashCommandHandler> {
  handler: T
  aliases: Set<string>
}

/**
 * Generic, type-parameterized command registry.
 *
 * Supports:
 *   - **Decorator:** `@registry.command('name', { aliases: ['a'] })`
 *   - **Direct:** `registry.register(handler, ['alias1'])`
 *   - **Name override:** `registry.register(handler, [], 'renamed')`
 */
export class SlashCommandRegistry<T extends SlashCommandHandler = SlashCommandHandler> {
  private readonly entries = new Map<string, CommandEntry<T>>()

  /**
   * Register a handler directly. Optionally provide aliases and name override.
   * Returns the handler (mutated with the overridden name if provided).
   */
  register(handler: T, aliases: string[] = [], nameOverride?: string): T {
    log.debug(`register handler: ${handler.name}`)
    const target = nameOverride ? { ...handler, name: nameOverride } : handler
    const canonical = target.name
    const aliasSet = new Set(aliases)

    this.entries.set(canonical, { handler: target, aliases: aliasSet })
    for (const alias of aliasSet) {
      if (!this.entries.has(alias)) {
        this.entries.set(alias, { handler: target, aliases: aliasSet })
      }
    }
    return target
  }

  /**
   * Returns a class decorator that registers the constructor's prototype as a handler.
   * Usage: `@registry.command('name', { aliases: ['a'] })`
   */
  command(name: string, opts?: { aliases?: string[] }): ClassDecorator {
    const aliases = opts?.aliases ?? []
    return (target: unknown) => {
      const Ctor = target as ClassConstructor<T>
      const instance = new Ctor()
      if (name) (instance as Record<string, unknown>).name = name
      this.register(instance, aliases)
    }
  }

  /** Find a handler by name or alias. */
  find(name: string): T | undefined {
    return this.entries.get(name)?.handler
  }

  /** Return all registered handlers (deduplicated by canonical name). */
  getAll(): T[] {
    const seen = new Set<string>()
    const result: T[] = []
    for (const [key, entry] of this.entries) {
      const canonical = entry.handler.name
      if (seen.has(canonical)) continue
      seen.add(canonical)
      void key // used only for iteration
      result.push(entry.handler)
    }
    return result
  }

  /** Number of unique handlers. */
  size(): number {
    return this.getAll().length
  }
}
