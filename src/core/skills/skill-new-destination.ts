/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * skill-new-destination — onde `agf skill new` escreve (node_a287463cb115).
 *
 * PORQUÊ existe: `--dir` significava DESTINO em `skill new` e RAIZ DO PROJETO
 * em `skill list`. Cada comando cumpria a própria ajuda, e a sequência óbvia
 * (`new --dir R` depois `list --dir R`) criava uma skill que nenhuma superfície
 * enxergava — sem erro e sem aviso. Colisão de sentido entre subcomandos irmãos
 * é pior que um bug ruidoso: tudo "funciona".
 *
 * DECISÃO (ADR no nó): `--dir` é a raiz nos dois. O destino sai das MESMAS
 * raízes que o `list` varre (`defaultSkillRoots`), então criar e listar não
 * podem discordar por construção. Destino explícito continua possível via
 * `--dest`, e é conferido contra as raízes: insistir num caminho fora delas é
 * legítimo, mas o usuário precisa saber que a skill não aparecerá na lista.
 *
 * Puro: decide e devolve: não cria diretório. Quem escreve é o scaffolder,
 * depois — misturar decisão e efeito é o que torna um erro de caminho
 * irreversível.
 */

import { defaultSkillRoots } from './skill-registry.js'

export interface SkillNewDestinationInput {
  /** Raiz do projeto — o MESMO sentido que `--dir` tem em `skill list`. */
  dir: string
  /** Destino explícito (`--dest`), quando o usuário quer escolher o caminho. */
  dest?: string
}

export interface SkillNewDestination {
  destination: string
  /** True quando nenhuma raiz varrida cobre o destino — a skill não aparecerá em `skill list`. */
  outsideScannedRoots: boolean
  /** Aviso pronto para exibir; ausente quando o destino é descobrível. */
  warning?: string
}

/** A raiz preferida para skills de projeto entre as que o `list` varre. */
function preferredRoot(projectRoot: string): string {
  const roots = defaultSkillRoots(projectRoot)
  // `.claude/skills` é a convenção do CLI mais usado; se o conjunto mudar, o
  // fallback mantém a garantia que importa — estar DENTRO de uma raiz varrida.
  return roots.find((r) => r.endsWith('.claude/skills')) ?? roots[0]
}

/** Decide onde a skill será escrita e se ela ficará descobrível. */
export function resolveSkillNewDestination(input: SkillNewDestinationInput): SkillNewDestination {
  if (!input.dest) {
    return { destination: preferredRoot(input.dir), outsideScannedRoots: false }
  }

  // `dest` capturado numa const: o non-null assertion dentro do closure era
  // desnecessário e o lint o cobra com razão — o estreitamento acima já garante.
  const dest = input.dest
  const covered = defaultSkillRoots(input.dir).some((root) => dest === root || dest.startsWith(`${root}/`))
  if (covered) return { destination: input.dest, outsideScannedRoots: false }

  return {
    destination: input.dest,
    outsideScannedRoots: true,
    warning: `${input.dest} está fora das raízes varridas — a skill NÃO vai aparecer em 'agf skill list'`,
  }
}
