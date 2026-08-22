import { REDACTED, isSensitiveField, redactAriaSnapshot } from './redact'

/**
 * The action trail: what the tester did, when, and enough about each target to write a
 * selector for it later.
 *
 * This is the build-once piece. Phase 1 only shows it as repro steps, but Phase 2 cannot
 * generate a test without it, and it cannot be reconstructed after the fact — the DOM it
 * describes is gone.
 *
 * Everything arriving from the page is hostile input. The binding is a global any script
 * on the page can call, with any payload, as often as it likes, so nothing here trusts
 * shape, type or size.
 */

export const BINDING_NAME = '__snapitAction'

/** Enough for a long flow; a bound so a page calling the binding in a loop cannot win. */
export const MAX_ACTIONS = 500
/** An ARIA snapshot of a large app is big, and it is stored per action. */
export const MAX_SNAPSHOT_CHARS = 20_000
const MAX_STRING = 200

export type SelectorCandidate =
  | { kind: 'testid'; value: string }
  | { kind: 'id'; value: string }
  | { kind: 'role'; role: string; name: string }
  | { kind: 'label'; value: string }
  | { kind: 'text'; value: string }
  | { kind: 'css'; value: string }

export type ActionRecord = {
  atMs: number
  type: 'click' | 'fill' | 'change' | 'submit' | 'press'
  tag: string
  /** Ranked best-first, so a generator can take the first it can disambiguate. */
  selectors: SelectorCandidate[]
  /** Present for fills; redacted when the field looks like a credential. */
  value?: string
  /** ARIA snapshot after the action settled — the assertion source in Phase 2. */
  ariaAfter?: string
}

const ACTION_TYPES = new Set(['click', 'fill', 'change', 'submit', 'press'])

const str = (v: unknown, max = MAX_STRING): string | null =>
  typeof v === 'string' && v.length > 0 ? v.slice(0, max) : null

function normalizeSelectors(raw: unknown): SelectorCandidate[] {
  if (!Array.isArray(raw)) return []
  const out: SelectorCandidate[] = []
  for (const item of raw.slice(0, 8)) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const kind = str(o.kind, 16)
    if (kind === 'role') {
      const role = str(o.role, 40)
      const name = str(o.name)
      if (role && name) out.push({ kind: 'role', role, name })
      continue
    }
    const value = str(o.value, kind === 'css' ? 400 : MAX_STRING)
    if (!value) continue
    if (kind === 'testid' || kind === 'id' || kind === 'label' || kind === 'text' || kind === 'css') {
      out.push({ kind, value })
    }
  }
  return out
}

/**
 * A fill's value is genuinely needed to write a test, but a password field's is never
 * worth having. Redact on the field's own signals rather than on the value, which tells
 * you nothing.
 */
export function redactActionValue(
  value: string,
  hints: { inputType?: string | null; name?: string | null; id?: string | null; autocomplete?: string | null }
): string {
  if (hints.inputType === 'password') return REDACTED
  const named = [hints.name, hints.id, hints.autocomplete].filter((n): n is string => typeof n === 'string')
  return named.some(isSensitiveField) ? REDACTED : value
}

/** Turn one page-supplied payload into a record, or null if it is not usable. */
export function normalizeAction(raw: unknown, atMs: number): ActionRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const type = str(o.type, 16)
  if (!type || !ACTION_TYPES.has(type)) return null
  const tag = str(o.tag, 40) ?? 'unknown'
  const record: ActionRecord = {
    atMs: Number.isFinite(atMs) && atMs >= 0 ? Math.round(atMs) : 0,
    type: type as ActionRecord['type'],
    tag: tag.toLowerCase(),
    selectors: normalizeSelectors(o.selectors)
  }
  const value = str(o.value)
  if (value !== null) {
    record.value = redactActionValue(value, {
      inputType: str(o.inputType, 32),
      name: str(o.name, 64),
      id: str(o.id, 64),
      autocomplete: str(o.autocomplete, 64)
    })
  }
  return record
}

/** Bound the size and strip typed values. Never store a raw snapshot. */
export function prepareSnapshot(text: string): string {
  const redacted = redactAriaSnapshot(text)
  return redacted.length <= MAX_SNAPSHOT_CHARS
    ? redacted
    : `${redacted.slice(0, MAX_SNAPSHOT_CHARS)}\n… truncated by snapit`
}

/** Append within the cap, dropping the oldest — the tail is where the bug is. */
export function appendAction(actions: ActionRecord[], action: ActionRecord): ActionRecord[] {
  const next = actions.length >= MAX_ACTIONS ? actions.slice(1) : actions.slice()
  next.push(action)
  return next
}

/**
 * A one-line description of an action, for repro steps. Prefers the selector a human
 * would recognise — what the thing is called — over the one a machine would pick.
 */
export function actionLabel(action: ActionRecord): string {
  const byKind = (kind: SelectorCandidate['kind']): SelectorCandidate | undefined =>
    action.selectors.find((s) => s.kind === kind)
  const role = byKind('role')
  const named =
    (role && role.kind === 'role' && `${role.role} “${role.name}”`) ||
    (byKind('label') as { value: string } | undefined)?.value ||
    (byKind('text') as { value: string } | undefined)?.value ||
    (byKind('testid') as { value: string } | undefined)?.value ||
    action.tag
  const verb =
    action.type === 'fill'
      ? 'Fill'
      : action.type === 'submit'
        ? 'Submit'
        : action.type === 'click'
          ? 'Click'
          : 'Change'
  const value = action.value !== undefined ? ` with “${action.value}”` : ''
  return `${verb} ${named}${value}`
}

/**
 * The listener injected into every document. Capture-phase so it sees events a page
 * stops from bubbling, and wrapped throughout so a failure here can never break the
 * application under test — this runs in the tester's real session.
 */
export const INJECTED_SCRIPT = `(() => {
  if (window.__snapitInstalled) return
  window.__snapitInstalled = true
  const send = (payload) => {
    try { window.${BINDING_NAME}(JSON.stringify(payload)) } catch (e) { /* binding gone */ }
  }
  const attr = (el, n) => { try { return el.getAttribute(n) } catch (e) { return null } }
  const text = (el) => {
    try { return (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 120) }
    catch (e) { return '' }
  }
  const IMPLICIT = { BUTTON: 'button', A: 'link', SELECT: 'combobox', TEXTAREA: 'textbox', H1: 'heading', H2: 'heading', H3: 'heading' }
  const role = (el) => {
    const explicit = attr(el, 'role')
    if (explicit) return explicit
    if (el.tagName === 'INPUT') {
      const t = (el.type || 'text').toLowerCase()
      if (t === 'checkbox') return 'checkbox'
      if (t === 'radio') return 'radio'
      if (t === 'submit' || t === 'button') return 'button'
      return 'textbox'
    }
    return IMPLICIT[el.tagName] || null
  }
  const name = (el) => {
    const aria = attr(el, 'aria-label')
    if (aria) return aria
    const labelledby = attr(el, 'aria-labelledby')
    if (labelledby) {
      const l = document.getElementById(labelledby)
      if (l) return text(l)
    }
    if (el.labels && el.labels[0]) return text(el.labels[0])
    const ph = attr(el, 'placeholder')
    if (ph) return ph
    const alt = attr(el, 'alt')
    if (alt) return alt
    return text(el)
  }
  const cssPath = (el) => {
    try {
      const parts = []
      let node = el
      while (node && node.nodeType === 1 && parts.length < 5) {
        let part = node.tagName.toLowerCase()
        if (node.id) { parts.unshift(part + '#' + node.id); break }
        const parent = node.parentNode
        if (parent) {
          const same = Array.prototype.filter.call(parent.children, (c) => c.tagName === node.tagName)
          if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(node) + 1) + ')'
        }
        parts.unshift(part)
        node = node.parentElement
      }
      return parts.join(' > ')
    } catch (e) { return '' }
  }
  const selectors = (el) => {
    const out = []
    const testid = attr(el, 'data-testid') || attr(el, 'data-test-id') || attr(el, 'data-test')
    if (testid) out.push({ kind: 'testid', value: testid })
    if (el.id) out.push({ kind: 'id', value: el.id })
    const r = role(el), n = name(el)
    if (r && n) out.push({ kind: 'role', role: r, name: n })
    if (el.labels && el.labels[0]) out.push({ kind: 'label', value: text(el.labels[0]) })
    const t = text(el)
    if (t) out.push({ kind: 'text', value: t })
    const css = cssPath(el)
    if (css) out.push({ kind: 'css', value: css })
    return out
  }
  const describe = (el, type, extra) => {
    const payload = {
      type: type,
      tag: el.tagName,
      selectors: selectors(el),
      inputType: el.tagName === 'INPUT' ? (el.type || 'text') : null,
      name: attr(el, 'name'),
      id: el.id || null,
      autocomplete: attr(el, 'autocomplete')
    }
    if (extra) Object.assign(payload, extra)
    send(payload)
  }
  document.addEventListener('click', (e) => {
    try { if (e.target && e.target.nodeType === 1) describe(e.target, 'click') } catch (err) {}
  }, true)
  document.addEventListener('change', (e) => {
    try {
      const el = e.target
      if (!el || el.nodeType !== 1) return
      const isField = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT'
      describe(el, isField ? 'fill' : 'change', isField ? { value: String(el.value == null ? '' : el.value) } : null)
    } catch (err) {}
  }, true)
  document.addEventListener('submit', (e) => {
    try { if (e.target && e.target.nodeType === 1) describe(e.target, 'submit') } catch (err) {}
  }, true)
})()`
