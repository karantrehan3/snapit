import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement
} from 'react'
import { Button, type ButtonProps } from './Button'
import { Icon, type IconName } from './Icon'
import { KeyCap, keyRow } from './KeyCap'

/**
 * A button that opens a list of things it can do.
 *
 * Built because the alternative was a row of icon-only buttons, and an icon cannot tell
 * "Screenshot" from "Record" from "Record silently" — three rectangles with something
 * inside them. A control whose meaning arrives only on hover teaches nothing, and the
 * hotkeys it should be teaching are the whole interface.
 *
 * `SourceDropdown` in the record bar is the older version of this idea and stays where it
 * is: it lives on glass, opens upward, and its content is a thumbnail grid rather than a
 * list. What it does not have is a keyboard, which is most of what this file is.
 *
 * Escape closes and gives focus back to the trigger; arrows, Home and End move; Enter and
 * Space choose; a mousedown anywhere else closes. `role="menu"` with `aria-expanded` on
 * the trigger, so it is announced as what it is.
 */

export type MenuItem =
  | { kind: 'separator'; key: string }
  | {
      kind?: 'item'
      key: string
      label: string
      icon?: IconName
      /** One line under the label. Worth it for an action whose name is not enough. */
      hint?: string
      /** Display glyphs for the chord that does the same thing without the menu. */
      keys?: string[]
      /** Rendered as the loud one. At most one. */
      primary?: boolean
      onSelect: () => void
    }

const isItem = (i: MenuItem): i is Extract<MenuItem, { key: string; label: string }> => i.kind !== 'separator'

export function Menu({
  items,
  align = 'start',
  width = 340,
  ...trigger
}: {
  items: MenuItem[]
  /** Which edge of the trigger the menu lines up with. */
  align?: 'start' | 'end'
  /** Wide enough that a one-line description stays one line. */
  width?: number
} & Omit<ButtonProps, 'onClick' | 'iconAfter'>): ReactElement {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const wrap = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const id = useId()

  const selectable = items.filter(isItem)

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }, [])

  // Anywhere else closes it. Capture phase, so it fires before a handler that stops
  // propagation — the same reason `SourceDropdown` does it this way.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown, true)
    return () => document.removeEventListener('mousedown', onDown, true)
  }, [open])

  // Focus lands inside on open, so the keyboard is usable without a mouse first.
  useEffect(() => {
    if (!open) return
    setActive(0)
    const first = listRef.current?.querySelector<HTMLElement>('[role="menuitem"]')
    first?.focus()
  }, [open])

  const move = (to: number): void => {
    const next = (to + selectable.length) % selectable.length
    setActive(next)
    listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')[next]?.focus()
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close(true)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      move(active + 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      move(active - 1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      move(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      move(selectable.length - 1)
    }
  }

  return (
    <div ref={wrap} style={{ position: 'relative' }}>
      <Button
        {...trigger}
        ref={triggerRef}
        iconAfter="chevron-down"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
      />

      {open && (
        <div
          ref={listRef}
          id={id}
          role="menu"
          onKeyDown={onKeyDown}
          style={{ ...sheet, width, ...(align === 'end' ? { right: 0 } : { left: 0 }) }}
        >
          {items.map((item) =>
            isItem(item) ? (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                data-menuitem
                style={row(item.primary === true)}
                onClick={() => {
                  close(false)
                  item.onSelect()
                }}
              >
                {item.icon && (
                  <span style={rowIcon}>
                    <Icon name={item.icon} size={15} />
                  </span>
                )}
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={rowLabel}>{item.label}</span>
                  {item.hint && <span style={rowHint}>{item.hint}</span>}
                </span>
                {item.keys && item.keys.length > 0 && (
                  <span style={{ ...keyRow, flex: 'none' }}>
                    {item.keys.map((k, i) => (
                      <KeyCap key={`${k}-${i}`}>{k}</KeyCap>
                    ))}
                  </span>
                )}
              </button>
            ) : (
              <span key={item.key} style={separator} role="separator" />
            )
          )}
        </div>
      )}
    </div>
  )
}

const sheet: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 6px)',
  zIndex: 20,
  padding: 5,
  borderRadius: 'var(--r-lg)',
  border: '1px solid var(--surface-edge)',
  background: 'var(--surface-raised)',
  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.06), 0 18px 40px -16px rgba(0, 0, 0, 0.55)',
  display: 'flex',
  flexDirection: 'column',
  gap: 1
}

function row(primary: boolean): CSSProperties {
  return {
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 9,
    width: '100%',
    padding: '7px 8px',
    borderRadius: 'var(--r-md)',
    border: 'none',
    background: primary ? 'var(--focus-soft)' : 'transparent',
    textAlign: 'left',
    color: 'inherit',
    font: 'inherit',
    cursor: 'pointer'
  }
}

const rowIcon: CSSProperties = { flex: 'none', paddingTop: 1, color: 'var(--ink-2)' }

const rowLabel: CSSProperties = { display: 'block', fontSize: 'var(--t-body)', fontWeight: 600 }

const rowHint: CSSProperties = {
  display: 'block',
  marginTop: 2,
  color: 'var(--ink-3)',
  fontSize: 'var(--t-small)',
  lineHeight: 1.4
}

const separator: CSSProperties = {
  display: 'block',
  height: 1,
  margin: '4px 2px',
  background: 'var(--rule)'
}
