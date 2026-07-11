/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Idiotypic Network — Treg-mediated network regulation of immune responses.
 *
 * Bio foundation: Jerne's Idiotypic Network Theory (Nobel Prize 1984).
 * Jerne proposed that the immune system is a network of interacting
 * antibodies and lymphocytes, where each antibody's variable region
 * (idiotype) is recognized by other antibodies (anti-idiotypes). This
 * creates a self-regulating network that prevents over-reactivity.
 *
 * Farmer, Packard & Perelson (1986) formalized this for machine learning
 * using differential equations for network concentration dynamics:
 *   dx_i/dt = c(Σξⱼᵢ - Σξᵢₖ + bᵢ) - k₁xᵢ
 *
 * Here, each TCellResponse is a network node with:
 *   - actionKind as its "paratope" (what it recognizes)
 *   - targetFile as its "epitope" (where it binds)
 *
 * Network interactions:
 *   - Responses to the SAME file with the SAME actionKind → mutually
 *     suppressive (redundant, would produce identical fixes)
 *   - Responses to the SAME file with DIFFERENT actionKinds → mildly
 *     stimulatory (address different aspects of the same problem)
 *   - Responses to DIFFERENT files → no direct interaction
 *
 * The net idiotypic effect adjusts each response's affinity:
 *   new_affinity = max(0.05, min(1.0, affinity + adjustment))
 *
 * Papers:
 *   - Jerne, N.K. (1974). Towards a network theory of the immune system.
 *     Annales d'Immunologie, 125C(1-2), 373-389.
 *   - Farmer, J.D., Packard, N.H., Perelson, A.S. (1986). The immune
 *     system, adaptation, and machine learning. Physica D, 22(1-3), 187-204.
 *   - Bersini, H., Varela, F.J. (1990). Hints for adaptive problem solving
 *     gleaned from immune networks. Parallel Problem Solving from Nature.
 */

import type { TCellResponse, IdiotypicNetworkConfig } from './immune-types.js'
import { DEFAULT_IDIOTYPIC_NETWORK_CONFIG } from './immune-types.js'

export interface NetworkNode {
  response: TCellResponse
  paratope: string
  epitope: string
  concentration: number
}

export interface IdiotypicInteraction {
  fromIndex: number
  toIndex: number
  strength: number
  kind: 'stimulatory' | 'suppressive'
}

function buildParatope(actionKind: string): string {
  return `act:${actionKind}`
}

function buildEpitope(file: string): string {
  return `file:${file}`
}

export function buildInteractionMatrix(
  nodes: NetworkNode[],
  config: IdiotypicNetworkConfig = DEFAULT_IDIOTYPIC_NETWORK_CONFIG,
): IdiotypicInteraction[] {
  const interactions: IdiotypicInteraction[] = []

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]
      const b = nodes[j]

      if (a.epitope !== b.epitope) continue

      const aConc = a.concentration
      const bConc = b.concentration

      if (a.paratope === b.paratope) {
        const strength = Math.round(config.suppressionDecay * Math.min(aConc, bConc) * 100) / 100
        interactions.push({ fromIndex: i, toIndex: j, strength, kind: 'suppressive' })
        interactions.push({ fromIndex: j, toIndex: i, strength, kind: 'suppressive' })
      } else {
        const strength = Math.round(config.stimulationGain * Math.min(aConc, bConc) * 100) / 100
        interactions.push({ fromIndex: i, toIndex: j, strength, kind: 'stimulatory' })
        interactions.push({ fromIndex: j, toIndex: i, strength, kind: 'stimulatory' })
      }
    }
  }

  return interactions
}

export function applyIdiotypicRegulation(
  nodes: NetworkNode[],
  interactions: IdiotypicInteraction[],
  config: IdiotypicNetworkConfig = DEFAULT_IDIOTYPIC_NETWORK_CONFIG,
): NetworkNode[] {
  const netEffects = new Array(nodes.length).fill(0)

  for (const interaction of interactions) {
    const effect = interaction.kind === 'stimulatory' ? interaction.strength : -interaction.strength
    netEffects[interaction.toIndex] += effect
  }

  return nodes.map((node, i) => {
    const adjustment = config.couplingConstant * netEffects[i]
    const newConcentration = Math.round(Math.max(0.05, Math.min(1.0, node.concentration + adjustment)) * 100) / 100
    return {
      ...node,
      concentration: newConcentration,
    }
  })
}

export function regulateResponses(
  responses: TCellResponse[],
  config: IdiotypicNetworkConfig = DEFAULT_IDIOTYPIC_NETWORK_CONFIG,
): TCellResponse[] {
  if (responses.length <= 1) return responses

  const nodes: NetworkNode[] = responses.map((r) => ({
    response: r,
    paratope: buildParatope(r.actionKind),
    epitope: buildEpitope(r.targetFile),
    concentration: r.affinity,
  }))

  const interactions = buildInteractionMatrix(nodes, config)
  if (interactions.length === 0) return responses

  const regulatedNodes = applyIdiotypicRegulation(nodes, interactions, config)

  return regulatedNodes.map((n) => ({
    ...n.response,
    affinity: n.concentration,
  }))
}
