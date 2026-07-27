/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Skeletons for the TypeScript-facing scaffolds. Each hole is `{{slot}}`, named exactly as the
 * scaffold declares it — a slot with no marker is a hole the agent cannot find, and the suite
 * refuses that (see builtin-templates.test.ts).
 *
 * These are structure, not solutions: the imports, the shape, the test that fails first. What the
 * model contributes is the part only it can know. What it no longer writes is the boilerplate,
 * and that is what `measured_template` counts.
 */

/** `templates/react-component.md` — a typed component with its test, RTL and behaviour-first. */
export const REACT_COMPONENT = `// {{description}}

import { useState, useEffect } from 'react'

export interface {{componentName}}Props {
  // {{props[]}} — one field per prop, typed. No \`any\`; optional props carry a default below.
}

export function {{componentName}}({ ...props }: {{componentName}}Props) {
  // {{hooks[]}} — one hook per line. Derive; do not mirror props into state.

  return (
    <section aria-label="{{componentName}}">
      {/* Structure only. Semantic elements before generic wrappers. */}
    </section>
  )
}

// ── {{componentName}}.test.tsx ────────────────────────────────────────────────
// import { render, screen } from '@testing-library/react'
//
// it('renders the label a user would look for', () => {
//   render(<{{componentName}} {...props} />)
//   expect(screen.getByRole('region', { name: '{{componentName}}' })).toBeVisible()
// })
`

/** `templates/cli-ts.md` — a Commander CLI whose commands are lazy and whose output is an envelope. */
export const CLI_TS = `// {{projectName}} v{{version}} — {{description}}

import { Command } from 'commander'

/** Every command answers with the same envelope, so a caller parses once. */
interface Envelope<T> {
  ok: boolean
  data?: T
  error?: string
}

const program = new Command('{{projectName}}').version('{{version}}').description('{{description}}')

// {{commands[]}} — one \`.command()\` per entry. Register lazily: a command that is not
// run should not pay for its imports.
program
  .command('example <arg>')
  .description('replace me')
  .option('--json', 'emit the envelope even when a human format is the default')
  .action(async (arg: string) => {
    const result: Envelope<{ arg: string }> = { ok: true, data: { arg } }
    process.stdout.write(JSON.stringify(result) + '\\n')
  })

program.parseAsync(process.argv).catch((err: unknown) => {
  process.stdout.write(JSON.stringify({ ok: false, error: String(err) }) + '\\n')
  process.exitCode = 1
})
`

/** `templates/fastapi-project.md` — routers, Pydantic models, and a dependency-injected session. */
export const FASTAPI_PROJECT = `# {{projectName}} — {{description}}

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session


# {{models[]}} — one Pydantic model per entry. Validate at the boundary, never inside.
class ExampleIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class ExampleOut(BaseModel):
    id: int
    name: str

    model_config = {"from_attributes": True}


def get_session() -> Session:
    """Injected per request; the route never opens its own."""
    raise NotImplementedError


router = APIRouter(prefix="/{{projectName}}", tags=["{{projectName}}"])


# {{routes[]}} — one route per entry. Return the model, not the ORM row.
@router.post("", response_model=ExampleOut, status_code=status.HTTP_201_CREATED)
def create(payload: ExampleIn, session: Session = Depends(get_session)) -> ExampleOut:
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED)
`
