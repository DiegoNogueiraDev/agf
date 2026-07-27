/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * WizardScreen — onboarding guiado para novos projetos.
 * Mostra passos iniciais quando o grafo esta vazio.
 * Exporta também detectProviders/buildWizardInitialState para permitir
 * que o TUI skip o wizard quando um provider já está configurado.
 */
import { useState, useEffect, useCallback, type ReactElement } from 'react'
import { Box, Text } from 'ink'
import { listProviders, resolveProviderConfig } from '../core/model-hub/provider-registry.js'

export interface DetectedProvider {
  id: string
  label: string
  detected: boolean
  envVar: string
}

export interface WizardState {
  step: 'welcome' | 'provider' | 'done'
  selectedProvider: string | undefined
}

/** Returns all known providers annotated with whether their env var is set. */
export function detectProviders(env: Record<string, string | undefined>): DetectedProvider[] {
  return listProviders().map((id) => {
    const cfg = resolveProviderConfig(id)!
    const detected = !cfg.requiresKey || Boolean(env[cfg.envVar])
    return { id, label: cfg.label, detected, envVar: cfg.envVar }
  })
}

/** Builds the initial wizard state from the environment. */
export function buildWizardInitialState(env: Record<string, string | undefined>): WizardState {
  const providers = detectProviders(env)
  const first = providers.find((p) => p.detected)
  return {
    step: 'welcome',
    selectedProvider: first?.id,
  }
}

const STEPS = [
  {
    title: 'Bem-vindo ao agent-graph-flow',
    lines: [
      'Seu ambiente de desenvolvimento guiado por agentes.',
      'Vamos construir software com qualidade, assertividade e zero retrabalho.',
    ],
  },
  {
    title: 'Passo 1: Crie um PRD',
    lines: [
      'Use /generate-prd <descricao do seu produto>',
      'Ex: /generate-prd API REST para gestao de tarefas com auth JWT',
      '',
      'Isso vai analisar sua ideia e criar requisitos no grafo.',
    ],
  },
  {
    title: 'Passo 2: Explore os comandos',
    lines: [
      '/kanban — Visualize o board kanban',
      '/feedback — Status completo da fase atual',
      '/preset apply strict-tdd — Ative TDD obrigatorio',
      '/scaffold — Gere esqueletos de codigo',
      '/help — Todos os comandos disponiveis',
    ],
  },
]

export function WizardScreen({ onDone }: { onDone: () => void }): ReactElement {
  const [current, setCurrent] = useState(0)

  const done = useCallback(onDone, [onDone])

  useEffect(() => {
    const delay = current === 0 ? 1800 : current < STEPS.length ? 2500 : 1500
    const t = setTimeout(() => {
      if (current >= STEPS.length - 1) {
        done()
      } else {
        setCurrent((c) => c + 1)
      }
    }, delay)
    return () => clearTimeout(t)
  }, [current, done])

  const step = STEPS[current]

  return (
    <Box flexDirection="column" paddingX={2} paddingTop={1}>
      <Box borderStyle="round" paddingX={2} paddingY={1} flexDirection="column">
        <Text bold color="cyan">
          {step.title}
        </Text>
        {step.lines.map((line, i) => (
          <Text key={i} dimColor={line === ''}>
            {line || ' '}
          </Text>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          {current + 1}/{STEPS.length}
        </Text>
      </Box>
    </Box>
  )
}
