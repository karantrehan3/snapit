import { describe, it, expect } from 'vitest'
import { actionsToSpec, locatorFor, quote } from '../specgen'
import { REDACTED } from '../collector/redact'
import type { ActionRecord } from '../collector/actions'

describe('quote', () => {
  it('escapes what would otherwise end the string early', () => {
    expect(quote("O'Brien")).toBe("'O\\'Brien'")
    expect(quote('a\\b')).toBe("'a\\\\b'")
    expect(quote('two\nlines')).toBe("'two\\nlines'")
  })
})

describe('locatorFor', () => {
  it('prefers a test id above everything', () => {
    expect(
      locatorFor([
        { kind: 'css', value: 'div > button' },
        { kind: 'role', role: 'button', name: 'Go' },
        { kind: 'testid', value: 'submit' }
      ])
    ).toBe("page.getByTestId('submit')")
  })

  it('falls back to role and accessible name', () => {
    expect(
      locatorFor([
        { kind: 'css', value: 'x' },
        { kind: 'role', role: 'button', name: 'Place order' }
      ])
    ).toBe("page.getByRole('button', { name: 'Place order' })")
  })

  it('walks down the ranking to a label, then text, then id', () => {
    expect(locatorFor([{ kind: 'label', value: 'Email' }])).toBe("page.getByLabel('Email')")
    expect(locatorFor([{ kind: 'text', value: 'Sign in' }])).toBe("page.getByText('Sign in')")
    expect(locatorFor([{ kind: 'id', value: 'go' }])).toBe("page.locator('#go')")
  })

  it('uses a CSS path only when nothing better exists', () => {
    // It breaks on any refactor, which is why it is last rather than absent.
    expect(locatorFor([{ kind: 'css', value: 'form > button:nth-of-type(2)' }])).toBe(
      "page.locator('form > button:nth-of-type(2)')"
    )
  })

  it('says so rather than emitting something that silently matches nothing', () => {
    expect(locatorFor([])).toContain('could not identify')
  })

  it('escapes a name containing a quote', () => {
    expect(locatorFor([{ kind: 'role', role: 'button', name: "O'Brien" }])).toContain("\\'")
  })
})

describe('actionsToSpec', () => {
  const actions: ActionRecord[] = [
    {
      atMs: 2_000,
      type: 'fill',
      tag: 'input',
      value: 'ada@example.com',
      selectors: [{ kind: 'label', value: 'Email' }]
    },
    {
      atMs: 3_000,
      type: 'fill',
      tag: 'input',
      value: REDACTED,
      selectors: [{ kind: 'label', value: 'Password' }]
    },
    {
      atMs: 5_000,
      type: 'click',
      tag: 'button',
      selectors: [{ kind: 'testid', value: 'place-order' }]
    },
    { atMs: 5_100, type: 'submit', tag: 'form', selectors: [] }
  ]

  const spec = actionsToSpec({
    actions,
    navigations: [{ atMs: 500, url: 'https://shop.test/checkout' }],
    markers: [{ atMs: 4_000, note: 'discount should apply here' }],
    bundleName: 'snapit-2026-08-23_14-31-07'
  })

  it('produces a file that reads as a Playwright test', () => {
    expect(spec).toContain("import { test, expect } from '@playwright/test'")
    expect(spec).toContain('async ({ page }) => {')
    expect(spec.trimEnd().endsWith('})')).toBe(true)
  })

  it('opens with the navigation, whatever order the events arrived in', () => {
    const goto = spec.indexOf('page.goto')
    const firstFill = spec.indexOf('.fill(')
    expect(goto).toBeGreaterThan(-1)
    expect(goto).toBeLessThan(firstFill)
  })

  it('replays the steps in the order they happened', () => {
    expect(spec.indexOf("getByLabel('Email')")).toBeLessThan(spec.indexOf("getByTestId('place-order')"))
  })

  it('never puts a redacted value in the generated code', () => {
    expect(spec).not.toContain(REDACTED)
    expect(spec).toContain("process.env.TEST_SECRET ?? ''")
    expect(spec).toContain('looked like a credential')
  })

  it('places a marker between the steps it fell between', () => {
    const marker = spec.indexOf('discount should apply here')
    expect(marker).toBeGreaterThan(spec.indexOf("getByLabel('Password')"))
    expect(marker).toBeLessThan(spec.indexOf("getByTestId('place-order')"))
  })

  it('does not double the form submit that the click already performed', () => {
    expect(spec.match(/\.click\(\)/g)).toHaveLength(1)
    expect(spec).toContain('form submitted by the step above')
  })

  it('asserts nothing, and says where the assertions come from', () => {
    // A skeleton that guessed assertions would be worse than one that admits it has none.
    expect(spec).not.toContain('expect(')
    expect(spec).toContain('actions.json')
    expect(spec).toContain('ariaAfter')
    expect(spec).toContain('TODO')
  })

  it('shifts markers onto the session clock when they came from a recording', () => {
    const shifted = actionsToSpec({
      actions,
      navigations: [],
      markers: [{ atMs: 1_000, note: 'late' }],
      recordingOffsetMs: 20_000,
      bundleName: 'b'
    })
    // 1s into a recording that began 20s into the session is 21s of session time.
    expect(shifted).toContain('marker at 0:21')
  })

  it('produces something valid for a session with no actions at all', () => {
    const empty = actionsToSpec({ actions: [], navigations: [], markers: [], bundleName: 'b' })
    expect(empty).toContain('async ({ page }) => {')
    expect(empty.trimEnd().endsWith('})')).toBe(true)
  })
})
