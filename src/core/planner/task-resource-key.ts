/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * task-resource-key — fonte ÚNICA do formato de chave de lease de task
 * (node_9cf396489fd8).
 *
 * WHY: `task:<nodeId>` vivia duplicado em 5 módulos (claim-next-task,
 * renew-task-claim, release-task-claim, agent-activity, claims-cmd) e um
 * drift real já custou um release no-op silencioso (o release consultava o id
 * puro enquanto o claim gravava com prefixo). Quem MONTA e quem PARSEIA a
 * chave importam daqui — drift vira erro de compilação, não bug de runtime.
 * Regra da skill: "when two modules share a key format, export ONE constant
 * both use".
 */

export const TASK_RESOURCE_PREFIX = 'task'

const KEY_PREFIX = `${TASK_RESOURCE_PREFIX}:`

/** Chave de lease canônica de uma task: `task:<taskId>`. */
export function taskResourceId(taskId: string): string {
  return `${KEY_PREFIX}${taskId}`
}

/** Id da task de uma chave de lease, ou null quando não é do namespace task. */
export function taskIdFromResource(resourceId: string): string | null {
  return resourceId.startsWith(KEY_PREFIX) ? resourceId.slice(KEY_PREFIX.length) : null
}
