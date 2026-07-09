/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Command } from 'commander'

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function collectOptions(cmd: Command): string[] {
  const opts: string[] = []
  for (const o of cmd.options) {
    for (const f of o.long ? [o.long] : []) opts.push(f)
    for (const f of o.short ?? []) if (f) opts.push(f)
  }
  return opts.sort()
}

function findSubCommand(cmd: Command, name: string): Command | undefined {
  return cmd.commands.find((c) => c.name() === name)
}

function extractActions(cmd: Command): string[] {
  return cmd.commands.map((c) => `${c.name()}: ${c.description()}`)
}

/* ------------------------------------------------------------------ */
/*  autopilot-cmd                                                      */
/* ------------------------------------------------------------------ */

describe('autopilot command', () => {
  it('exports autopilotCommand function', async () => {
    const mod = await import('../cli/commands/autopilot-cmd.js')
    expect(typeof mod.autopilotCommand).toBe('function')
  })

  it('creates command with correct name and description', async () => {
    const mod = await import('../cli/commands/autopilot-cmd.js')
    const cmd = mod.autopilotCommand()
    expect(cmd).toBeInstanceOf(Command)
    expect(cmd.name()).toBe('autopilot')
    expect(cmd.description()).toContain('Loop autônomo')
  })

  it('configures expected options', async () => {
    const mod = await import('../cli/commands/autopilot-cmd.js')
    const cmd = mod.autopilotCommand()
    const opts = collectOptions(cmd)
    expect(opts).toContain('--dir')
    expect(opts).toContain('--max')
    expect(opts).toContain('--simulate')
    expect(opts).toContain('--live')
    expect(opts).toContain('--test-cmd')
    expect(opts).toContain('--retries')
    expect(opts).toContain('--flow')
    expect(opts).toContain('--profile')
  })
})

/* ------------------------------------------------------------------ */
/*  build-cmd                                                          */
/* ------------------------------------------------------------------ */

describe('build command', () => {
  it('exports buildCommand function', async () => {
    const mod = await import('../cli/commands/build-cmd.js')
    expect(typeof mod.buildCommand).toBe('function')
  })

  it('creates command with correct name and description', async () => {
    const mod = await import('../cli/commands/build-cmd.js')
    const cmd = mod.buildCommand()
    expect(cmd).toBeInstanceOf(Command)
    expect(cmd.name()).toBe('build')
    expect(cmd.description()).toContain('Orquestra')
  })

  it('configures expected options', async () => {
    const mod = await import('../cli/commands/build-cmd.js')
    const cmd = mod.buildCommand()
    const opts = collectOptions(cmd)
    expect(opts).toContain('--dir')
    expect(opts).toContain('--prd')
    expect(opts).toContain('--max')
    expect(opts).toContain('--live')
    expect(opts).toContain('--test-cmd')
  })
})

/* ------------------------------------------------------------------ */
/*  check-cmd                                                          */
/* ------------------------------------------------------------------ */

describe('check command', () => {
  it('exports checkCommand function', async () => {
    const mod = await import('../cli/commands/check-cmd.js')
    expect(typeof mod.checkCommand).toBe('function')
  })

  it('creates command with correct name and description', async () => {
    const mod = await import('../cli/commands/check-cmd.js')
    const cmd = mod.checkCommand()
    expect(cmd).toBeInstanceOf(Command)
    expect(cmd.name()).toBe('check')
    expect(cmd.description()).toContain('Definition of Done')
  })

  it('has a required argument nodeId', async () => {
    const mod = await import('../cli/commands/check-cmd.js')
    const cmd = mod.checkCommand()
    const args = [...cmd.registeredArguments]
    expect(args).toHaveLength(1)
    const arg = args[0]
    expect(arg.name()).toBe('nodeId')
    expect(arg.required).toBe(true)
  })

  it('configures expected options', async () => {
    const mod = await import('../cli/commands/check-cmd.js')
    const cmd = mod.checkCommand()
    const opts = collectOptions(cmd)
    expect(opts).toContain('--dir')
  })
})

/* ------------------------------------------------------------------ */
/*  constitution-cmd                                                   */
/* ------------------------------------------------------------------ */

describe('constitution command', () => {
  it('exports constitutionCommand function', async () => {
    const mod = await import('../cli/commands/constitution-cmd.js')
    expect(typeof mod.constitutionCommand).toBe('function')
  })

  it('creates command with correct name and description', async () => {
    const mod = await import('../cli/commands/constitution-cmd.js')
    const cmd = mod.constitutionCommand()
    expect(cmd).toBeInstanceOf(Command)
    expect(cmd.name()).toBe('constitution')
    expect(cmd.description()).toContain('Manage project principles')
  })

  it('configures expected options', async () => {
    const mod = await import('../cli/commands/constitution-cmd.js')
    const cmd = mod.constitutionCommand()
    const opts = collectOptions(cmd)
    expect(opts).toContain('--create')
    expect(opts).toContain('--list')
    expect(opts).toContain('--check')
  })
})

/* ------------------------------------------------------------------ */
/*  daemon-cmd                                                         */
/* ------------------------------------------------------------------ */

describe('daemon command', () => {
  it('exports daemonCommand function', async () => {
    const mod = await import('../cli/commands/daemon-cmd.js')
    expect(typeof mod.daemonCommand).toBe('function')
  })

  it('creates command with correct name and description', async () => {
    const mod = await import('../cli/commands/daemon-cmd.js')
    const cmd = mod.daemonCommand()
    expect(cmd).toBeInstanceOf(Command)
    expect(cmd.name()).toBe('daemon')
    expect(cmd.description()).toContain('Inspect and clean up')
  })

  it('has subcommands prune and list', async () => {
    const mod = await import('../cli/commands/daemon-cmd.js')
    const cmd = mod.daemonCommand()
    const actions = extractActions(cmd)
    expect(actions).toEqual(expect.arrayContaining([expect.stringMatching(/^prune:/), expect.stringMatching(/^list:/)]))
  })

  it('prune subcommand has --dry-run flag', async () => {
    const mod = await import('../cli/commands/daemon-cmd.js')
    const cmd = mod.daemonCommand()
    const prune = findSubCommand(cmd, 'prune')!
    expect(prune).toBeDefined()
    const opts = collectOptions(prune)
    expect(opts).toContain('--dry-run')
  })
})

/* ------------------------------------------------------------------ */
/*  decompose-cmd                                                      */
/* ------------------------------------------------------------------ */

describe('decompose command', () => {
  it('exports decomposeCommand function', async () => {
    const mod = await import('../cli/commands/decompose-cmd.js')
    expect(typeof mod.decomposeCommand).toBe('function')
  })

  it('creates command with correct name and description', async () => {
    const mod = await import('../cli/commands/decompose-cmd.js')
    const cmd = mod.decomposeCommand()
    expect(cmd).toBeInstanceOf(Command)
    expect(cmd.name()).toBe('decompose')
    expect(cmd.description()).toContain('tasks grandes')
  })

  it('configures expected options', async () => {
    const mod = await import('../cli/commands/decompose-cmd.js')
    const cmd = mod.decomposeCommand()
    const opts = collectOptions(cmd)
    expect(opts).toContain('--dir')
  })
})

/* ------------------------------------------------------------------ */
/*  doctor-cmd                                                         */
/* ------------------------------------------------------------------ */

describe('doctor command', () => {
  it('exports doctorCommand function', async () => {
    const mod = await import('../cli/commands/doctor-cmd.js')
    expect(typeof mod.doctorCommand).toBe('function')
  })

  it('creates command with correct name and description', async () => {
    const mod = await import('../cli/commands/doctor-cmd.js')
    const cmd = mod.doctorCommand()
    expect(cmd).toBeInstanceOf(Command)
    expect(cmd.name()).toBe('doctor')
    expect(cmd.description()).toContain('Validate the execution environment')
  })

  it('configures expected options', async () => {
    const mod = await import('../cli/commands/doctor-cmd.js')
    const cmd = mod.doctorCommand()
    const opts = collectOptions(cmd)
    expect(opts).toContain('--dir')
    expect(opts).toContain('--providers')
  })
})

/* ------------------------------------------------------------------ */
/*  gc-cmd                                                             */
/* ------------------------------------------------------------------ */

describe('gc command', () => {
  it('exports gcCommand function', async () => {
    const mod = await import('../cli/commands/gc-cmd.js')
    expect(typeof mod.gcCommand).toBe('function')
  })

  it('creates command with correct name and description', async () => {
    const mod = await import('../cli/commands/gc-cmd.js')
    const cmd = mod.gcCommand()
    expect(cmd).toBeInstanceOf(Command)
    expect(cmd.name()).toBe('gc')
    expect(cmd.description()).toContain('Garbage-collect')
  })

  it('configures expected options', async () => {
    const mod = await import('../cli/commands/gc-cmd.js')
    const cmd = mod.gcCommand()
    const opts = collectOptions(cmd)
    expect(opts).toContain('--dir')
    expect(opts).toContain('--ttl')
  })
})

/* ------------------------------------------------------------------ */
/*  generate-prd-cmd                                                   */
/* ------------------------------------------------------------------ */

describe('generate-prd command', () => {
  it('exports generatePrdCommand function', async () => {
    const mod = await import('../cli/commands/generate-prd-cmd.js')
    expect(typeof mod.generatePrdCommand).toBe('function')
  })

  it('creates command with correct name and description', async () => {
    const mod = await import('../cli/commands/generate-prd-cmd.js')
    const cmd = mod.generatePrdCommand()
    expect(cmd).toBeInstanceOf(Command)
    expect(cmd.name()).toBe('generate-prd')
    expect(cmd.description()).toContain('Gera um PRD')
  })

  it('has a required argument descricao', async () => {
    const mod = await import('../cli/commands/generate-prd-cmd.js')
    const cmd = mod.generatePrdCommand()
    const args = [...cmd.registeredArguments]
    expect(args).toHaveLength(1)
    const arg = args[0]
    expect(arg.name()).toBe('descricao')
    expect(arg.required).toBe(true)
  })

  it('configures expected options', async () => {
    const mod = await import('../cli/commands/generate-prd-cmd.js')
    const cmd = mod.generatePrdCommand()
    const opts = collectOptions(cmd)
    expect(opts).toContain('--dir')
    expect(opts).toContain('--out')
    expect(opts).toContain('--import')
    expect(opts).toContain('--model')
  })
})

/* ------------------------------------------------------------------ */
/*  harness-cmd                                                        */
/* ------------------------------------------------------------------ */

describe('harness command', () => {
  it('exports harnessCommand function', async () => {
    const mod = await import('../cli/commands/harness-cmd.js')
    expect(typeof mod.harnessCommand).toBe('function')
  })

  it('creates command with correct name and description', async () => {
    const mod = await import('../cli/commands/harness-cmd.js')
    const cmd = mod.harnessCommand()
    expect(cmd).toBeInstanceOf(Command)
    expect(cmd.name()).toBe('harness')
    expect(cmd.description()).toContain('harnessability score')
  })

  it('configures expected options', async () => {
    const mod = await import('../cli/commands/harness-cmd.js')
    const cmd = mod.harnessCommand()
    const opts = collectOptions(cmd)
    expect(opts).toContain('--dir')
    expect(opts).toContain('--violations')
  })
})

/* ------------------------------------------------------------------ */
/*  import-cmd                                                         */
/* ------------------------------------------------------------------ */

describe('import-prd command', () => {
  it('exports importCommand function', async () => {
    const mod = await import('../cli/commands/import-cmd.js')
    expect(typeof mod.importCommand).toBe('function')
  })

  it('creates command with correct name and description', async () => {
    const mod = await import('../cli/commands/import-cmd.js')
    const cmd = mod.importCommand()
    expect(cmd).toBeInstanceOf(Command)
    expect(cmd.name()).toBe('import-prd')
    expect(cmd.description()).toContain('Importa')
  })

  it('has a required argument file', async () => {
    const mod = await import('../cli/commands/import-cmd.js')
    const cmd = mod.importCommand()
    const args = [...cmd.registeredArguments]
    expect(args).toHaveLength(1)
    const arg = args[0]
    expect(arg.name()).toBe('file')
    expect(arg.required).toBe(true)
  })

  it('configures expected options', async () => {
    const mod = await import('../cli/commands/import-cmd.js')
    const cmd = mod.importCommand()
    const opts = collectOptions(cmd)
    expect(opts).toContain('--dir')
    expect(opts).toContain('--force')
    expect(opts).toContain('--allow-empty')
  })
})

/* ------------------------------------------------------------------ */
/*  init-cmd                                                           */
/* ------------------------------------------------------------------ */

describe('init command', () => {
  it('exports initCommand function', async () => {
    const mod = await import('../cli/commands/init-cmd.js')
    expect(typeof mod.initCommand).toBe('function')
  })

  it('exports runInitOrchestration pure function', async () => {
    const mod = await import('../cli/commands/init-cmd.js')
    expect(typeof mod.runInitOrchestration).toBe('function')
  })

  it('creates command with correct name and description', async () => {
    const mod = await import('../cli/commands/init-cmd.js')
    const cmd = mod.initCommand()
    expect(cmd).toBeInstanceOf(Command)
    expect(cmd.name()).toBe('init')
    expect(cmd.description()).toContain('Initialize agf')
  })

  it('configures expected options', async () => {
    const mod = await import('../cli/commands/init-cmd.js')
    const cmd = mod.initCommand()
    const opts = collectOptions(cmd)
    expect(opts).toContain('--dir')
    expect(opts).toContain('--name')
    expect(opts).toContain('--port')
    expect(opts).toContain('--skip-neural')
    expect(opts).toContain('--no-serve')
  })

  it('runInitOrchestration returns success when all phases pass', async () => {
    const mod = await import('../cli/commands/init-cmd.js')
    const deps = {
      isDbInitialized: vi.fn().mockReturnValue(false),
      runSetup: vi.fn().mockResolvedValue(undefined),
      atomicWrites: vi.fn().mockResolvedValue(new Map()),
      isNeuralReady: vi.fn().mockResolvedValue(true),
      installNeural: vi.fn().mockResolvedValue('ready' as const),
      runDoctor: vi.fn().mockResolvedValue({
        passed: true,
        summary: { ok: 5, warning: 0, error: 0 },
        checks: [],
      }),
      startServer: vi.fn().mockResolvedValue(undefined),
      out: vi.fn(),
      detectCli: vi.fn().mockResolvedValue(undefined),
    }

    const result = await mod.runInitOrchestration(
      { dir: '/tmp/test', skipNeural: false, noServe: true, port: 3000 },
      deps,
    )
    expect(result.success).toBe(true)
    expect(deps.runSetup).toHaveBeenCalledWith('/tmp/test', true, false)
    expect(deps.atomicWrites).toHaveBeenCalledWith('init')
    expect(deps.runDoctor).toHaveBeenCalledWith('/tmp/test')
    expect(deps.startServer).not.toHaveBeenCalled()
  })

  it('--force forces update mode (atomicWrites + runUpdate) even with no DB', async () => {
    const mod = await import('../cli/commands/init-cmd.js')
    const deps = {
      isDbInitialized: vi.fn().mockReturnValue(false), // isNew = true (no DB)
      runSetup: vi.fn().mockResolvedValue(undefined),
      atomicWrites: vi.fn().mockResolvedValue(new Map()),
      isNeuralReady: vi.fn().mockResolvedValue(true),
      installNeural: vi.fn().mockResolvedValue('ready' as const),
      runDoctor: vi.fn().mockResolvedValue({
        passed: true,
        summary: { ok: 5, warning: 0, error: 0 },
        checks: [],
      }),
      startServer: vi.fn().mockResolvedValue(undefined),
      out: vi.fn(),
      detectCli: vi.fn().mockResolvedValue(undefined),
    }

    const result = await mod.runInitOrchestration(
      { dir: '/tmp/test', skipNeural: true, noServe: true, port: 3000, force: true },
      deps,
    )
    expect(result.success).toBe(true)
    // force flips the tag from 'init' to 'update' so managed blocks are re-synced
    expect(deps.atomicWrites).toHaveBeenCalledWith('update')
    expect(deps.runSetup).toHaveBeenCalledWith('/tmp/test', true, true)
  })

  it('init configures --force option', async () => {
    const mod = await import('../cli/commands/init-cmd.js')
    const cmd = mod.initCommand()
    const opts = collectOptions(cmd)
    expect(opts).toContain('--force')
  })

  it('runInitOrchestration handles doctor failure', async () => {
    const mod = await import('../cli/commands/init-cmd.js')
    const deps = {
      isDbInitialized: vi.fn().mockReturnValue(true),
      runSetup: vi.fn().mockResolvedValue(undefined),
      atomicWrites: vi.fn().mockResolvedValue(new Map()),
      isNeuralReady: vi.fn().mockResolvedValue(true),
      installNeural: vi.fn().mockResolvedValue('ready' as const),
      runDoctor: vi.fn().mockResolvedValue({
        passed: false,
        summary: { ok: 3, warning: 1, error: 2 },
        checks: [],
      }),
      startServer: vi.fn().mockResolvedValue(undefined),
      out: vi.fn(),
      detectCli: vi.fn().mockResolvedValue(undefined),
    }

    const result = await mod.runInitOrchestration(
      { dir: '/tmp/test', skipNeural: true, noServe: true, port: 3000 },
      deps,
    )
    expect(result.success).toBe(false)
    expect(deps.startServer).not.toHaveBeenCalled()
  })

  it('runInitOrchestration starts server when noServe is false', async () => {
    const mod = await import('../cli/commands/init-cmd.js')
    const deps = {
      isDbInitialized: vi.fn().mockReturnValue(false),
      runSetup: vi.fn().mockResolvedValue(undefined),
      atomicWrites: vi.fn().mockResolvedValue(new Map()),
      isNeuralReady: vi.fn().mockResolvedValue(true),
      installNeural: vi.fn().mockResolvedValue('ready' as const),
      runDoctor: vi.fn().mockResolvedValue({
        passed: true,
        summary: { ok: 5, warning: 0, error: 0 },
        checks: [],
      }),
      startServer: vi.fn().mockResolvedValue(undefined),
      out: vi.fn(),
      detectCli: vi.fn().mockResolvedValue(undefined),
    }

    await mod.runInitOrchestration({ dir: '/tmp/test', skipNeural: true, noServe: false, port: 3000 }, deps)
    expect(deps.startServer).toHaveBeenCalledWith(3000)
  })
})

/* ------------------------------------------------------------------ */
/*  login-cmd                                                          */
/* ------------------------------------------------------------------ */

describe('login command', () => {
  it('exports loginCommand function', async () => {
    const mod = await import('../cli/commands/login-cmd.js')
    expect(typeof mod.loginCommand).toBe('function')
  })

  it('exports logoutCommand function', async () => {
    const mod = await import('../cli/commands/login-cmd.js')
    expect(typeof mod.logoutCommand).toBe('function')
  })

  it('creates login command with correct name and description', async () => {
    const mod = await import('../cli/commands/login-cmd.js')
    const cmd = mod.loginCommand()
    expect(cmd).toBeInstanceOf(Command)
    expect(cmd.name()).toBe('login')
    expect(cmd.description()).toContain('Autentica')
  })

  it('creates logout command with correct name and description', async () => {
    const mod = await import('../cli/commands/login-cmd.js')
    const cmd = mod.logoutCommand()
    expect(cmd).toBeInstanceOf(Command)
    expect(cmd.name()).toBe('logout')
    expect(cmd.description()).toContain('Remove o token')
  })

  it('login configures --token option', async () => {
    const mod = await import('../cli/commands/login-cmd.js')
    const cmd = mod.loginCommand()
    const opts = collectOptions(cmd)
    expect(opts).toContain('--token')
  })
})

/* ------------------------------------------------------------------ */
/*  metrics-cmd                                                        */
/* ------------------------------------------------------------------ */

describe('metrics command', () => {
  it('exports metricsCommand function', async () => {
    const mod = await import('../cli/commands/metrics-cmd.js')
    expect(typeof mod.metricsCommand).toBe('function')
  })

  it('creates command with correct name and description', async () => {
    const mod = await import('../cli/commands/metrics-cmd.js')
    const cmd = mod.metricsCommand()
    expect(cmd).toBeInstanceOf(Command)
    expect(cmd.name()).toBe('metrics')
    expect(cmd.description()).toContain('Métricas de token')
  })

  it('configures expected options', async () => {
    const mod = await import('../cli/commands/metrics-cmd.js')
    const cmd = mod.metricsCommand()
    const opts = collectOptions(cmd)
    expect(opts).toContain('--dir')
    expect(opts).toContain('--session')
    expect(opts).toContain('--top')
  })
})

/* ------------------------------------------------------------------ */
/*  model-cmd                                                          */
/* ------------------------------------------------------------------ */

describe('model command', () => {
  it('exports modelCommand function', async () => {
    const mod = await import('../cli/commands/model-cmd.js')
    expect(typeof mod.modelCommand).toBe('function')
  })

  it('creates command with correct name and description', async () => {
    const mod = await import('../cli/commands/model-cmd.js')
    const cmd = mod.modelCommand()
    expect(cmd).toBeInstanceOf(Command)
    expect(cmd.name()).toBe('model')
    expect(cmd.description()).toContain('tier-router')
  })

  it('has subcommands list, current, set, route', async () => {
    const mod = await import('../cli/commands/model-cmd.js')
    const cmd = mod.modelCommand()
    const actions = extractActions(cmd)
    expect(actions).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^list:/),
        expect.stringMatching(/^current:/),
        expect.stringMatching(/^set:/),
        expect.stringMatching(/^route:/),
      ]),
    )
  })

  it('current subcommand has --dir option', async () => {
    const mod = await import('../cli/commands/model-cmd.js')
    const cmd = mod.modelCommand()
    const current = findSubCommand(cmd, 'current')!
    expect(current).toBeDefined()
    const opts = collectOptions(current)
    expect(opts).toContain('--dir')
  })

  it('set subcommand has argument idOrAuto', async () => {
    const mod = await import('../cli/commands/model-cmd.js')
    const cmd = mod.modelCommand()
    const setCmd = findSubCommand(cmd, 'set')!
    expect(setCmd).toBeDefined()
    const setArgs = [...setCmd.registeredArguments]
    expect(setArgs).toHaveLength(1)
    expect(setArgs[0].name()).toBe('idOrAuto')
  })

  it('route subcommand has argument kind and --dir option', async () => {
    const mod = await import('../cli/commands/model-cmd.js')
    const cmd = mod.modelCommand()
    const route = findSubCommand(cmd, 'route')!
    expect(route).toBeDefined()
    const routeArgs = [...route.registeredArguments]
    expect(routeArgs).toHaveLength(1)
    expect(routeArgs[0].name()).toBe('kind')
    const opts = collectOptions(route)
    expect(opts).toContain('--dir')
  })
})

/* ------------------------------------------------------------------ */
/*  next-cmd                                                           */
/* ------------------------------------------------------------------ */

describe('next command', () => {
  it('exports nextCommand function', async () => {
    const mod = await import('../cli/commands/next-cmd.js')
    expect(typeof mod.nextCommand).toBe('function')
  })

  it('creates command with correct name and description', async () => {
    const mod = await import('../cli/commands/next-cmd.js')
    const cmd = mod.nextCommand()
    expect(cmd).toBeInstanceOf(Command)
    expect(cmd.name()).toBe('next')
    expect(cmd.description()).toContain('pull system')
  })

  it('configures --dir option', async () => {
    const mod = await import('../cli/commands/next-cmd.js')
    const cmd = mod.nextCommand()
    const opts = collectOptions(cmd)
    expect(opts).toContain('--dir')
  })
})

/* ------------------------------------------------------------------ */
/*  phase-cmd                                                          */
/* ------------------------------------------------------------------ */

describe('phase command', () => {
  it('exports phaseCommand function', async () => {
    const mod = await import('../cli/commands/phase-cmd.js')
    expect(typeof mod.phaseCommand).toBe('function')
  })

  it('creates command with correct name and description', async () => {
    const mod = await import('../cli/commands/phase-cmd.js')
    const cmd = mod.phaseCommand()
    expect(cmd).toBeInstanceOf(Command)
    expect(cmd.name()).toBe('phase')
    expect(cmd.description()).toContain('taxonomia')
  })

  it('configures --dir option', async () => {
    const mod = await import('../cli/commands/phase-cmd.js')
    const cmd = mod.phaseCommand()
    const opts = collectOptions(cmd)
    expect(opts).toContain('--dir')
  })
})

/* ------------------------------------------------------------------ */
/*  plugin-cmd                                                         */
/* ------------------------------------------------------------------ */

describe('plugin command', () => {
  it('exports pluginCommand function', async () => {
    const mod = await import('../cli/commands/plugin-cmd.js')
    expect(typeof mod.pluginCommand).toBe('function')
  })

  it('creates command with correct name and description', async () => {
    const mod = await import('../cli/commands/plugin-cmd.js')
    const cmd = mod.pluginCommand()
    expect(cmd).toBeInstanceOf(Command)
    expect(cmd.name()).toBe('plugin')
    expect(cmd.description()).toContain('Manage plugins')
  })

  it('configures expected options', async () => {
    const mod = await import('../cli/commands/plugin-cmd.js')
    const cmd = mod.pluginCommand()
    const opts = collectOptions(cmd)
    expect(opts).toContain('--install')
    expect(opts).toContain('--remove')
    expect(opts).toContain('--enable')
    expect(opts).toContain('--disable')
    expect(opts).toContain('--list')
    expect(opts).toContain('--info')
  })
})

/* ------------------------------------------------------------------ */
/*  preset-cmd                                                         */
/* ------------------------------------------------------------------ */

describe('preset command', () => {
  it('exports presetCommand function', async () => {
    const mod = await import('../cli/commands/preset-cmd.js')
    expect(typeof mod.presetCommand).toBe('function')
  })

  it('creates command with correct name and description', async () => {
    const mod = await import('../cli/commands/preset-cmd.js')
    const cmd = mod.presetCommand()
    expect(cmd).toBeInstanceOf(Command)
    expect(cmd.name()).toBe('preset')
    expect(cmd.description()).toContain('Manage workflow presets')
  })

  it('configures expected options', async () => {
    const mod = await import('../cli/commands/preset-cmd.js')
    const cmd = mod.presetCommand()
    const opts = collectOptions(cmd)
    expect(opts).toContain('--list')
    expect(opts).toContain('--apply')
    expect(opts).toContain('--show')
    expect(opts).toContain('--create')
  })
})

/* ------------------------------------------------------------------ */
/*  principles-cmd                                                     */
/* ------------------------------------------------------------------ */

describe('principles command', () => {
  it('exports principlesCommand function', async () => {
    const mod = await import('../cli/commands/principles-cmd.js')
    expect(typeof mod.principlesCommand).toBe('function')
  })

  it('creates command with correct name and description', async () => {
    const mod = await import('../cli/commands/principles-cmd.js')
    const cmd = mod.principlesCommand()
    expect(cmd).toBeInstanceOf(Command)
    expect(cmd.name()).toBe('principles')
    expect(cmd.description()).toContain('credo de engenharia')
  })

  it('has subcommands list and show', async () => {
    const mod = await import('../cli/commands/principles-cmd.js')
    const cmd = mod.principlesCommand()
    const actions = extractActions(cmd)
    expect(actions).toEqual(expect.arrayContaining([expect.stringMatching(/^list:/), expect.stringMatching(/^show:/)]))
  })

  it('list subcommand has --category option', async () => {
    const mod = await import('../cli/commands/principles-cmd.js')
    const cmd = mod.principlesCommand()
    const list = findSubCommand(cmd, 'list')!
    expect(list).toBeDefined()
    const opts = collectOptions(list)
    expect(opts).toContain('--category')
  })

  it('show subcommand has argument id', async () => {
    const mod = await import('../cli/commands/principles-cmd.js')
    const cmd = mod.principlesCommand()
    const show = findSubCommand(cmd, 'show')!
    const showArgs = [...show.registeredArguments]
    expect(showArgs).toHaveLength(1)
    expect(showArgs[0].name()).toBe('id')
  })
})

/* ------------------------------------------------------------------ */
/*  profile-cmd                                                        */
/* ------------------------------------------------------------------ */

describe('profile command', () => {
  it('exports profileCommand function', async () => {
    const mod = await import('../cli/commands/profile-cmd.js')
    expect(typeof mod.profileCommand).toBe('function')
  })

  it('exports applyProfile function', async () => {
    const mod = await import('../cli/commands/profile-cmd.js')
    expect(typeof mod.applyProfile).toBe('function')
  })

  it('creates command with correct name and description', async () => {
    const mod = await import('../cli/commands/profile-cmd.js')
    const cmd = mod.profileCommand()
    expect(cmd).toBeInstanceOf(Command)
    expect(cmd.name()).toBe('profile')
    expect(cmd.description()).toContain('Bundles de trabalho')
  })

  it('has subcommands list and show', async () => {
    const mod = await import('../cli/commands/profile-cmd.js')
    const cmd = mod.profileCommand()
    const actions = extractActions(cmd)
    expect(actions).toEqual(expect.arrayContaining([expect.stringMatching(/^list:/), expect.stringMatching(/^show:/)]))
  })

  it('show subcommand has argument nome', async () => {
    const mod = await import('../cli/commands/profile-cmd.js')
    const cmd = mod.profileCommand()
    const show = findSubCommand(cmd, 'show')!
    const showArgs = [...show.registeredArguments]
    expect(showArgs).toHaveLength(1)
    expect(showArgs[0].name()).toBe('nome')
  })
})

/* ------------------------------------------------------------------ */
/*  provider-cmd                                                       */
/* ------------------------------------------------------------------ */

describe('provider command', () => {
  it('exports providerCommand function', async () => {
    const mod = await import('../cli/commands/provider-cmd.js')
    expect(typeof mod.providerCommand).toBe('function')
  })

  it('creates command with correct name and description', async () => {
    const mod = await import('../cli/commands/provider-cmd.js')
    const cmd = mod.providerCommand()
    expect(cmd).toBeInstanceOf(Command)
    expect(cmd.name()).toBe('provider')
    expect(cmd.description()).toContain('Provider de modelo')
  })

  it('has subcommands list, use, current', async () => {
    const mod = await import('../cli/commands/provider-cmd.js')
    const cmd = mod.providerCommand()
    const actions = extractActions(cmd)
    expect(actions).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^list:/),
        expect.stringMatching(/^use:/),
        expect.stringMatching(/^current:/),
      ]),
    )
  })

  it('use subcommand has argument id and --dir', async () => {
    const mod = await import('../cli/commands/provider-cmd.js')
    const cmd = mod.providerCommand()
    const use = findSubCommand(cmd, 'use')!
    const useArgs = [...use.registeredArguments]
    expect(useArgs).toHaveLength(1)
    expect(useArgs[0].name()).toBe('id')
    const opts = collectOptions(use)
    expect(opts).toContain('--dir')
  })

  it('current subcommand has --dir option', async () => {
    const mod = await import('../cli/commands/provider-cmd.js')
    const cmd = mod.providerCommand()
    const current = findSubCommand(cmd, 'current')!
    const opts = collectOptions(current)
    expect(opts).toContain('--dir')
  })
})

/* ------------------------------------------------------------------ */
/*  quality-cmd                                                        */
/* ------------------------------------------------------------------ */

describe('quality command', () => {
  it('exports qualityCommand function', async () => {
    const mod = await import('../cli/commands/quality-cmd.js')
    expect(typeof mod.qualityCommand).toBe('function')
  })

  it('creates command with correct name and description', async () => {
    const mod = await import('../cli/commands/quality-cmd.js')
    const cmd = mod.qualityCommand()
    expect(cmd).toBeInstanceOf(Command)
    expect(cmd.name()).toBe('quality')
    expect(cmd.description()).toContain('Gate de qualidade')
  })

  it('configures expected options', async () => {
    const mod = await import('../cli/commands/quality-cmd.js')
    const cmd = mod.qualityCommand()
    const opts = collectOptions(cmd)
    expect(opts).toContain('--dir')
    expect(opts).toContain('--min-tests')
    expect(opts).toContain('--min-logs')
  })
})

/* ------------------------------------------------------------------ */
/*  run-cmd                                                            */
/* ------------------------------------------------------------------ */

describe('run command', () => {
  it('exports runCommand function', async () => {
    const mod = await import('../cli/commands/run-cmd.js')
    expect(typeof mod.runCommand).toBe('function')
  })

  it('creates command with correct name and description', async () => {
    const mod = await import('../cli/commands/run-cmd.js')
    const cmd = mod.runCommand()
    expect(cmd).toBeInstanceOf(Command)
    expect(cmd.name()).toBe('run')
    expect(cmd.description()).toContain('one-shot')
  })

  it('has a required argument prompt', async () => {
    const mod = await import('../cli/commands/run-cmd.js')
    const cmd = mod.runCommand()
    const args = [...cmd.registeredArguments]
    expect(args).toHaveLength(1)
    const arg = args[0]
    expect(arg.name()).toBe('prompt')
    expect(arg.required).toBe(true)
  })

  it('configures expected options', async () => {
    const mod = await import('../cli/commands/run-cmd.js')
    const cmd = mod.runCommand()
    const opts = collectOptions(cmd)
    expect(opts).toContain('--dir')
    expect(opts).toContain('--test-cmd')
    expect(opts).toContain('--retries')
    expect(opts).toContain('--model')
  })
})

/* ------------------------------------------------------------------ */
/*  skill-cmd                                                          */
/* ------------------------------------------------------------------ */

describe('skill command', () => {
  it('exports skillCommand function', async () => {
    const mod = await import('../cli/commands/skill-cmd.js')
    expect(typeof mod.skillCommand).toBe('function')
  })

  it('creates command with correct name and description', async () => {
    const mod = await import('../cli/commands/skill-cmd.js')
    const cmd = mod.skillCommand()
    expect(cmd).toBeInstanceOf(Command)
    expect(cmd.name()).toBe('skill')
    expect(cmd.description()).toContain('skills')
  })

  it('has subcommands list and show', async () => {
    const mod = await import('../cli/commands/skill-cmd.js')
    const cmd = mod.skillCommand()
    const actions = extractActions(cmd)
    expect(actions).toEqual(expect.arrayContaining([expect.stringMatching(/^list:/), expect.stringMatching(/^show:/)]))
  })

  it('list subcommand has --phase and --dir options', async () => {
    const mod = await import('../cli/commands/skill-cmd.js')
    const cmd = mod.skillCommand()
    const list = findSubCommand(cmd, 'list')!
    const opts = collectOptions(list)
    expect(opts).toContain('--phase')
    expect(opts).toContain('--dir')
  })

  it('show subcommand has argument nome', async () => {
    const mod = await import('../cli/commands/skill-cmd.js')
    const cmd = mod.skillCommand()
    const show = findSubCommand(cmd, 'show')!
    const showArgs = [...show.registeredArguments]
    expect(showArgs).toHaveLength(1)
    expect(showArgs[0].name()).toBe('nome')
  })
})

/* ------------------------------------------------------------------ */
/*  spec-cmd                                                           */
/* ------------------------------------------------------------------ */

describe('spec command', () => {
  it('exports specCommand function', async () => {
    const mod = await import('../cli/commands/spec-cmd.js')
    expect(typeof mod.specCommand).toBe('function')
  })

  it('creates command with correct name and description', async () => {
    const mod = await import('../cli/commands/spec-cmd.js')
    const cmd = mod.specCommand()
    expect(cmd).toBeInstanceOf(Command)
    expect(cmd.name()).toBe('spec')
    expect(cmd.description()).toContain('Spec generation')
  })

  it('configures expected options', async () => {
    const mod = await import('../cli/commands/spec-cmd.js')
    const cmd = mod.specCommand()
    const opts = collectOptions(cmd)
    expect(opts).toContain('--generate')
    expect(opts).toContain('--validate')
    expect(opts).toContain('--list-templates')
  })
})

/* ------------------------------------------------------------------ */
/*  stats-cmd                                                          */
/* ------------------------------------------------------------------ */

describe('stats command', () => {
  it('exports statsCommand function', async () => {
    const mod = await import('../cli/commands/stats-cmd.js')
    expect(typeof mod.statsCommand).toBe('function')
  })

  it('creates command with correct name and description', async () => {
    const mod = await import('../cli/commands/stats-cmd.js')
    const cmd = mod.statsCommand()
    expect(cmd).toBeInstanceOf(Command)
    expect(cmd.name()).toBe('stats')
    expect(cmd.description()).toContain('contagens do grafo')
  })

  it('configures --dir option', async () => {
    const mod = await import('../cli/commands/stats-cmd.js')
    const cmd = mod.statsCommand()
    const opts = collectOptions(cmd)
    expect(opts).toContain('--dir')
  })
})

/* ------------------------------------------------------------------ */
/*  tui-cmd                                                            */
/* ------------------------------------------------------------------ */

describe('tui command', () => {
  it('exports tuiCommand function', async () => {
    const mod = await import('../cli/commands/tui-cmd.js')
    expect(typeof mod.tuiCommand).toBe('function')
  })

  it('creates command with correct name and description', async () => {
    const mod = await import('../cli/commands/tui-cmd.js')
    const cmd = mod.tuiCommand()
    expect(cmd).toBeInstanceOf(Command)
    expect(cmd.name()).toBe('tui')
    expect(cmd.description()).toContain('TUI interativa')
  })

  it('configures --dir option', async () => {
    const mod = await import('../cli/commands/tui-cmd.js')
    const cmd = mod.tuiCommand()
    const opts = collectOptions(cmd)
    expect(opts).toContain('--dir')
  })
})

/* ------------------------------------------------------------------ */
/*  ui-cmd                                                             */
/* ------------------------------------------------------------------ */

describe('ui command', () => {
  it('exports uiCommand function', async () => {
    const mod = await import('../cli/commands/ui-cmd.js')
    expect(typeof mod.uiCommand).toBe('function')
  })

  it('creates command with correct name and description', async () => {
    const mod = await import('../cli/commands/ui-cmd.js')
    const cmd = mod.uiCommand()
    expect(cmd).toBeInstanceOf(Command)
    expect(cmd.name()).toBe('ui')
    expect(cmd.description()).toContain('Web mínima')
  })

  it('configures expected options', async () => {
    const mod = await import('../cli/commands/ui-cmd.js')
    const cmd = mod.uiCommand()
    const opts = collectOptions(cmd)
    expect(opts).toContain('--dir')
    expect(opts).toContain('--port')
  })
})
