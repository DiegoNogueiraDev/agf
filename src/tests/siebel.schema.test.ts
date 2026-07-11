import { describe, it, expect } from 'vitest'
import { SiebelObjectTypeSchema } from '../schemas/siebel.schema.js'

describe('SiebelObjectTypeSchema', () => {
  it('accepts core Siebel object types', () => {
    for (const t of ['applet', 'business_component', 'business_object', 'view', 'screen', 'workflow']) {
      expect(SiebelObjectTypeSchema.safeParse(t).success).toBe(true)
    }
  })

  it('accepts extended types', () => {
    for (const t of ['integration_object', 'business_service', 'escript', 'web_template', 'pick_list']) {
      expect(SiebelObjectTypeSchema.safeParse(t).success).toBe(true)
    }
  })

  it('rejects unknown type', () => {
    expect(SiebelObjectTypeSchema.safeParse('report').success).toBe(false)
  })
})
