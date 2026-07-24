/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Shim de compatibilidade — o módulo vivo mudou para
 * src/core/model-hub/provider-context.ts (node_c88541cf4a2d: o swarming
 * precisa construir o client sem violar o isolamento de camada, e a lógica
 * sempre foi 100% core). Consumidores da CLI seguem importando daqui.
 */

export * from '../../core/model-hub/provider-context.js'
