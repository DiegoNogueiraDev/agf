/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

export {
  checkNodeVersion,
  checkNodeVersionWith,
  checkWritePermissions,
  checkSqliteDatabase,
  checkDbIntegrity,
  checkGraphInitialized,
  checkConfigFile,
  checkDashboardBuild,
  checkIntegrations,
} from './doctor-checks.js'
export { runDoctor } from './doctor-runner.js'
export type { CheckLevel, CheckResult, DoctorReport } from './doctor-types.js'
