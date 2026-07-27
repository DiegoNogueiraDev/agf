/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * SessionRuntime — assembles the unified `Session` read-model in memory from
 * already-resolved inputs (thread ref, identity pieces, mode, model, run,
 * grants). Pure and immutable: it composes existing types, opens no stores, and
 * never mutates its inputs. Callers resolve the pieces from their own stores
 * (thread-store, worker-state, permission-store) and hand them in.
 */

import { randomUUID } from 'node:crypto'
import type { StoredThread } from '../thread-store/thread-store.js'
import type { PermissionMode } from '../worker-state/worker-state-schema.js'
import type {
  Session,
  SessionAgentRole,
  SessionModel,
  SessionThreadRef,
  Run,
  Grants,
} from '../../schemas/session.schema.js'

/** Resolved inputs needed to assemble a session. */
export interface SessionRuntimeInput {
  /** Lifecycle session id; `null` triggers a freshly minted UUID. */
  sessionId: string | null
  workerId: string
  agentRole: SessionAgentRole | null
  workspace: string
  thread: SessionThreadRef
  mode: PermissionMode
  model: SessionModel
  run?: Run | null
  grants?: Grants
}

/** Project a full `StoredThread` down to the fields the session layer needs. */
export function threadRefFromStored(thread: StoredThread): SessionThreadRef {
  return {
    id: thread.id,
    model: thread.model,
    modelProvider: thread.modelProvider,
    cwd: thread.cwd,
    agentRole: thread.agentRole,
  }
}

/** Build the unified `Session` from resolved inputs. Mints a sessionId if absent. */
export function assembleSession(input: SessionRuntimeInput): Session {
  const sessionId = input.sessionId && input.sessionId.length > 0 ? input.sessionId : randomUUID()
  return {
    identity: {
      sessionId,
      workerId: input.workerId,
      agentRole: input.agentRole,
      workspace: input.workspace,
    },
    thread: input.thread,
    mode: input.mode,
    model: input.model,
    run: input.run ?? null,
    grants: input.grants ?? [],
  }
}

/** Return a NEW session with `mode` changed. Does not mutate the input. */
export function setMode(session: Session, next: PermissionMode): Session {
  return { ...session, mode: next }
}
