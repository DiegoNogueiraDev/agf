import { describe, it, expect } from 'vitest'
import {
  SlashCommandRegistry,
  parseCommand,
  resolveAlias,
  fuzzyFilter,
  type SlashCommand,
  type SlashCommandHandler,
} from '../tui/slash/command-registry.js'

interface TestHandler extends SlashCommandHandler {
  description: string
}

describe('SlashCommandRegistry', () => {
  it('supports direct registration with register()', () => {
    const registry = new SlashCommandRegistry<TestHandler>()
    const handler: TestHandler = { name: 'test', description: 'A test command' }
    registry.register(handler)
    expect(registry.find('test')).toBe(handler)
  })

  it('supports register() with aliases', () => {
    const registry = new SlashCommandRegistry<TestHandler>()
    const handler: TestHandler = { name: 'build', description: 'Build project' }
    registry.register(handler, ['b'])
    expect(registry.find('build')).toBe(handler)
    expect(registry.find('b')).toBe(handler)
  })

  it('supports name override via decorator params', () => {
    const registry = new SlashCommandRegistry<TestHandler>()
    const handler: TestHandler = { name: 'myCommand', description: 'Overridden' }
    const decorated = registry.register(handler, [], 'renamed-cmd')
    expect(decorated.name).toBe('renamed-cmd')
    expect(registry.find('renamed-cmd')).toBe(decorated)
  })

  it('command() returns a class decorator', () => {
    const registry = new SlashCommandRegistry<TestHandler>()

    const decorator = registry.command('hello', { aliases: ['h'] })
    const target = function () {}
    decorator(target)

    const registered = registry.find('hello')
    expect(registered).toBeDefined()
    expect(registered!.name).toBe('hello')
  })

  it('returns undefined for unknown command', () => {
    const registry = new SlashCommandRegistry<TestHandler>()
    expect(registry.find('unknown')).toBeUndefined()
  })

  it('getAll returns all registered handlers', () => {
    const registry = new SlashCommandRegistry<TestHandler>()
    registry.register({ name: 'a', description: 'A' })
    registry.register({ name: 'b', description: 'B' })
    expect(registry.getAll()).toHaveLength(2)
  })

  it('handles duplicate registration (last wins)', () => {
    const registry = new SlashCommandRegistry<TestHandler>()
    registry.register({ name: 'cmd', description: 'First' })
    registry.register({ name: 'cmd', description: 'Second' })
    expect(registry.find('cmd')?.description).toBe('Second')
  })

  it('size returns count', () => {
    const registry = new SlashCommandRegistry<TestHandler>()
    registry.register({ name: 'a', description: 'A' })
    expect(registry.size()).toBe(1)
  })
})

describe('SlashCommandRegistry (decorator pattern)', () => {
  it('supports decorator-based class registration', () => {
    const registry = new SlashCommandRegistry<SlashCommandHandler>()

    const decorator = registry.command('greet', { aliases: ['g', 'hi'] })
    @decorator
    class GreetCommand implements SlashCommandHandler {
      name = 'greet'
      execute() {
        return 'hello'
      }
    }

    expect(registry.find('greet')).toBeDefined()
    expect(registry.find('g')).toBeDefined()
    expect(registry.find('hi')).toBeDefined()
  })

  it('dispatches to correct handler', () => {
    const registry = new SlashCommandRegistry<SlashCommandHandler>()

    const d1 = registry.command('foo')
    @d1
    class FooHandler implements SlashCommandHandler {
      name = 'foo'
      execute() {
        return 'foo-result'
      }
    }

    const handler = registry.find('foo')
    expect(handler).toBeDefined()
    expect(handler!.execute()).toBe('foo-result')
  })
})

describe('parseCommand', () => {
  it('extracts command and args from /cmd input', () => {
    expect(parseCommand('/test arg1 arg2')).toEqual({ cmd: 'test', args: 'arg1 arg2' })
  })

  it('handles command without args', () => {
    expect(parseCommand('/stats')).toEqual({ cmd: 'stats', args: '' })
  })

  it('returns empty cmd for non-slash input', () => {
    expect(parseCommand('hello world')).toEqual({ cmd: '', args: 'hello world' })
  })

  it('handles extra whitespace', () => {
    expect(parseCommand('  /next  task1  ')).toEqual({ cmd: 'next', args: 'task1' })
  })

  it('is case-insensitive for command name', () => {
    expect(parseCommand('/NEXT')).toEqual({ cmd: 'next', args: '' })
  })
})

describe('resolveAlias', () => {
  const commands: SlashCommand[] = [
    { name: 'next', aliases: ['n'], usage: '/next', desc: 'Next task' },
    { name: 'stats', aliases: ['s'], usage: '/stats', desc: 'Stats' },
    { name: 'help', usage: '/help', desc: 'Help' },
  ]

  it('maps alias to canonical name', () => {
    expect(resolveAlias('n', commands)).toBe('next')
    expect(resolveAlias('s', commands)).toBe('stats')
  })

  it('returns canonical name for non-alias', () => {
    expect(resolveAlias('help', commands)).toBe('help')
  })

  it('returns input for unknown command', () => {
    expect(resolveAlias('nonexistent', commands)).toBe('nonexistent')
  })
})

describe('fuzzyFilter', () => {
  const commands: SlashCommand[] = [
    { name: 'stats', usage: '/stats', desc: 'Stats' },
    { name: 'start', usage: '/start', desc: 'Start' },
    { name: 'stop', usage: '/stop', desc: 'Stop' },
    { name: 'next', usage: '/next', desc: 'Next' },
    { name: 'skills', usage: '/skills', desc: 'Skills' },
  ]

  it('sorts by subsequence match relevance', () => {
    const results = fuzzyFilter('st', commands)
    expect(results[0]?.name).toBe('stats')
  })

  it('returns all in original order for empty query', () => {
    expect(fuzzyFilter('', commands)).toHaveLength(5)
  })

  it('returns empty for no match', () => {
    expect(fuzzyFilter('xyz', commands)).toHaveLength(0)
  })

  it('matches aliases too', () => {
    const withAliases: SlashCommand[] = [{ name: 'cache-stats', aliases: ['cs'], usage: '/cache-stats', desc: 'Cache' }]
    expect(fuzzyFilter('cs', withAliases)).toHaveLength(1)
  })
})
