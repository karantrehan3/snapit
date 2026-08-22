import { describe, it, expect } from 'vitest'
import { REDACTED } from '../redact'
import {
  BINDING_NAME,
  INJECTED_SCRIPT,
  MAX_ACTIONS,
  MAX_SNAPSHOT_CHARS,
  actionLabel,
  appendAction,
  normalizeAction,
  redactActionValue,
  prepareSnapshot,
  type ActionRecord
} from '../actions'

const click = {
  type: 'click',
  tag: 'BUTTON',
  selectors: [
    { kind: 'testid', value: 'checkout' },
    { kind: 'role', role: 'button', name: 'Place order' }
  ]
}

describe('normalizeAction', () => {
  it('keeps a well-formed action, lowercasing the tag', () => {
    const a = normalizeAction(click, 1234)
    expect(a).toMatchObject({ type: 'click', tag: 'button', atMs: 1234 })
    expect(a?.selectors).toHaveLength(2)
  })

  it('rejects anything that is not a recognised action', () => {
    // The binding is a global any script on the page can call with any payload.
    expect(normalizeAction(null, 0)).toBeNull()
    expect(normalizeAction('click', 0)).toBeNull()
    expect(normalizeAction({ type: 'navigate' }, 0)).toBeNull()
    expect(normalizeAction({}, 0)).toBeNull()
  })

  it('bounds every string a hostile page could make enormous', () => {
    const huge = 'x'.repeat(100_000)
    const a = normalizeAction(
      { type: 'click', tag: huge, selectors: [{ kind: 'text', value: huge }], value: huge },
      0
    )
    expect(a!.tag.length).toBeLessThanOrEqual(40)
    expect(a!.value!.length).toBeLessThanOrEqual(200)
    expect((a!.selectors[0] as { value: string }).value.length).toBeLessThanOrEqual(200)
  })

  it('bounds how many selectors one payload can carry', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ kind: 'text', value: `t${i}` }))
    expect(
      normalizeAction({ type: 'click', tag: 'DIV', selectors: many }, 0)!.selectors.length
    ).toBeLessThanOrEqual(8)
  })

  it('drops malformed selector entries without dropping the action', () => {
    const a = normalizeAction(
      {
        type: 'click',
        tag: 'A',
        selectors: [null, 7, { kind: 'role', role: 'link' }, { kind: 'id', value: 'go' }]
      },
      0
    )
    expect(a!.selectors).toEqual([{ kind: 'id', value: 'go' }])
  })

  it('refuses a negative or non-finite timestamp', () => {
    expect(normalizeAction(click, -5)!.atMs).toBe(0)
    expect(normalizeAction(click, Number.NaN)!.atMs).toBe(0)
  })
})

describe('redactActionValue', () => {
  it('never records what was typed into a password field', () => {
    expect(redactActionValue('hunter2', { inputType: 'password' })).toBe(REDACTED)
  })

  it('redacts on the field name too, since a password can live in a text input', () => {
    expect(redactActionValue('hunter2', { name: 'user_password' })).toBe(REDACTED)
    expect(redactActionValue('abc', { autocomplete: 'current-password' })).toBe(REDACTED)
    expect(redactActionValue('abc', { id: 'apiKey' })).toBe(REDACTED)
  })

  it('keeps ordinary values, which is the whole point of recording them', () => {
    expect(redactActionValue('ada@example.com', { inputType: 'email', name: 'email' })).toBe(
      'ada@example.com'
    )
  })
})

describe('normalizeAction + fill redaction', () => {
  it('redacts a password fill end to end', () => {
    const a = normalizeAction(
      {
        type: 'fill',
        tag: 'INPUT',
        inputType: 'password',
        name: 'password',
        value: 'hunter2',
        selectors: []
      },
      10
    )
    expect(a!.value).toBe(REDACTED)
  })
})

describe('appendAction', () => {
  const make = (atMs: number): ActionRecord => ({ atMs, type: 'click', tag: 'button', selectors: [] })

  it('does not mutate the list it was given', () => {
    const before: ActionRecord[] = []
    appendAction(before, make(1))
    expect(before).toHaveLength(0)
  })

  it('holds at the cap, dropping the oldest', () => {
    let list: ActionRecord[] = []
    for (let i = 0; i < MAX_ACTIONS + 50; i++) list = appendAction(list, make(i))
    expect(list).toHaveLength(MAX_ACTIONS)
    expect(list[list.length - 1].atMs).toBe(MAX_ACTIONS + 49)
  })
})

describe('prepareSnapshot', () => {
  it('leaves a normal snapshot alone', () => {
    expect(prepareSnapshot('- button "Go"')).toBe('- button "Go"')
  })

  it('caps a huge one and says so', () => {
    const out = prepareSnapshot('x'.repeat(MAX_SNAPSHOT_CHARS * 2))
    expect(out.length).toBeLessThan(MAX_SNAPSHOT_CHARS + 100)
    expect(out).toContain('truncated by snapit')
  })

  it('never lets a typed password through', () => {
    // ariaSnapshot() includes input values, so this is a second, entirely separate
    // route for a credential to reach the bundle. A live run caught it.
    const out = prepareSnapshot('- textbox "Password": hunter2')
    expect(out).not.toContain('hunter2')
  })
})

describe('INJECTED_SCRIPT', () => {
  it('calls the binding the collector actually registers', () => {
    expect(INJECTED_SCRIPT).toContain(BINDING_NAME)
  })

  it('installs itself only once per document', () => {
    expect(INJECTED_SCRIPT).toContain('__snapitInstalled')
  })

  it('listens in the capture phase, so a page cannot hide events by stopping them', () => {
    const listeners = INJECTED_SCRIPT.match(/addEventListener\([^)]*/g) ?? []
    expect(listeners.length).toBeGreaterThanOrEqual(3)
    expect(INJECTED_SCRIPT.match(/}, true\)/g)?.length).toBeGreaterThanOrEqual(3)
  })
})

describe('actionLabel', () => {
  const make = (over: Partial<ActionRecord>): ActionRecord => ({
    atMs: 0,
    type: 'click',
    tag: 'button',
    selectors: [],
    ...over
  })

  it('names the target the way a person would, not the way a machine would', () => {
    const label = actionLabel(
      make({
        selectors: [
          { kind: 'css', value: 'div > form > button:nth-of-type(2)' },
          { kind: 'role', role: 'button', name: 'Place order' }
        ]
      })
    )
    expect(label).toBe('Click button “Place order”')
  })

  it('includes what was typed', () => {
    const label = actionLabel(
      make({
        type: 'fill',
        tag: 'input',
        value: 'ada@example.com',
        selectors: [{ kind: 'label', value: 'Email' }]
      })
    )
    expect(label).toBe('Fill Email with “ada@example.com”')
  })

  it('shows the redaction rather than pretending nothing was typed', () => {
    const label = actionLabel(make({ type: 'fill', tag: 'input', value: REDACTED, selectors: [] }))
    expect(label).toContain(REDACTED)
  })

  it('falls back to the tag when nothing identifies the element', () => {
    expect(actionLabel(make({ type: 'submit', tag: 'form' }))).toBe('Submit form')
  })
})
