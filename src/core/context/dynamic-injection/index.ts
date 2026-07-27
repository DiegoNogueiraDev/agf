export interface DynamicInjection {
  type: string
  content: string
}

export interface DynamicInjectionProvider {
  getInjections(history: unknown[]): Promise<DynamicInjection[]>
  onContextCompacted?(): void | Promise<void>
  onPhaseChanged?(phase: string): void | Promise<void>
}

export class InjectionRegistry {
  private providers: DynamicInjectionProvider[] = []

  register(provider: DynamicInjectionProvider): void {
    this.providers.push(provider)
  }

  unregister(provider: DynamicInjectionProvider): void {
    const idx = this.providers.indexOf(provider)
    if (idx !== -1) {
      this.providers.splice(idx, 1)
    }
  }

  async getAllInjections(history: unknown[]): Promise<DynamicInjection[]> {
    const seen = new Set<string>()
    const results: DynamicInjection[] = []

    for (const provider of this.providers) {
      const injections = await provider.getInjections(history)
      for (const inj of injections) {
        if (!seen.has(inj.type)) {
          seen.add(inj.type)
          results.push(inj)
        }
      }
    }

    return results
  }

  async notifyContextCompacted(): Promise<void> {
    for (const provider of this.providers) {
      await provider.onContextCompacted?.()
    }
  }
}

interface Message {
  role: string
  content: string
}

export function normalizeHistory(messages: Message[]): Message[] {
  const result: Message[] = []

  for (const msg of messages) {
    const last = result[result.length - 1]
    if (last && last.role === msg.role && msg.role === 'user') {
      last.content += '\n' + msg.content
    } else {
      result.push({ ...msg })
    }
  }

  return result
}

export const planModeProvider: DynamicInjectionProvider = {
  async getInjections(): Promise<DynamicInjection[]> {
    return [
      {
        type: 'plan-mode',
        content:
          '<system-reminder>\nVocê está em PLAN MODE. Apenas leia e analise — NÃO edite arquivos, NÃO crie arquivos, NÃO execute comandos que modifiquem o sistema.\n</system-reminder>',
      },
    ]
  },
}

export const tddReminderProvider: DynamicInjectionProvider = {
  async getInjections(): Promise<DynamicInjection[]> {
    return [
      {
        type: 'tdd-reminder',
        content:
          '<system-reminder>\nLembre-se: TDD Red→Green→Refactor. Escreva o teste primeiro, depois a implementação mínima, depois refatore.\n</system-reminder>',
      },
    ]
  },
}

export const wipReminderProvider: DynamicInjectionProvider = {
  async getInjections(): Promise<DynamicInjection[]> {
    return [
      {
        type: 'wip-reminder',
        content:
          '<system-reminder>\nWIP=1 ativo: você só pode ter UMA tarefa em andamento. Finalize a atual antes de iniciar outra.\n</system-reminder>',
      },
    ]
  },
}

export function createPhaseProvider(): DynamicInjectionProvider {
  let phase = 'unknown'

  return {
    async getInjections(): Promise<DynamicInjection[]> {
      return [
        {
          type: 'phase-context',
          content: `<system-reminder>\nFase atual do ciclo de vida: ${phase}. Siga os gates e pipelines da fase.\n</system-reminder>`,
        },
      ]
    },

    onPhaseChanged(newPhase: string): void {
      phase = newPhase
    },
  }
}
