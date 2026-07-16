/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * Integration: contract tests against Fake implementations.
 * These tests prove that each Fake correctly implements its contract.
 * GREEN = Fake is a valid implementation of the contract.
 */

import { runTaskLifecycleContractTests } from './contract-task-lifecycle.test'
import { runContextRuntimeContractTests } from './contract-context-runtime.test'
import { runHumanGateContractTests } from './contract-human-gate.test'
import { runWorkspaceStateContractTests } from './contract-workspace-state.test'

import { FakeTaskLifecycleService } from './helpers/fake-task-lifecycle'
import { FakeContextRuntimeService } from './helpers/fake-context-runtime'
import { FakeHumanGateService } from './helpers/fake-human-gate'
import { FakeWorkspaceStateService } from './helpers/fake-workspace-state'

runTaskLifecycleContractTests(() => new FakeTaskLifecycleService(), 'FakeTaskLifecycle')
runContextRuntimeContractTests(() => new FakeContextRuntimeService(), 'FakeContextRuntime')
runHumanGateContractTests(() => new FakeHumanGateService(), 'FakeHumanGate')
runWorkspaceStateContractTests(() => new FakeWorkspaceStateService(), 'FakeWorkspaceState')
