/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { createLogger } from '../../core/utils/logger.js'

const log = createLogger({ layer: 'core', source: 'plugins/browser' })

log.info('Browser plugin module loaded')

export { CdpConnection, type CdpConnectionConfig, type CdpEvent } from './cdp-connection.js'
export {
  CdpDaemon,
  type CdpDaemonConfig,
  type CdpDaemonStartResult,
  type CdpDaemonSendResult,
  type DaemonStatus,
} from './cdp-daemon.js'
export { discoverCdpUrl, type CdpDiscoveryOptions } from './discovery.js'
