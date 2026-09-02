import type { CSSProperties, ReactElement, ReactNode } from 'react'

/**
 * A labelled row in a form.
 *
 * Settings had this as a local component and Welcome had the same three-part shape
 * spelled out inline, which is why the hint under the bundle checkbox is 12px and the
 * hint beside the hotkey field is 13px — nothing was wrong with either, they just never
 * met.
 *
 * The label is a `<label>` only when it is given something to point at. A `for` with no
 * matching id is worse than no label element at all: assistive technology announces the
 * control as unlabelled and the markup claims otherwise.
 */
export function Field({
  label,
  hint,
  htmlFor,
  children
}: {
  label: string
  /** Under the control, not beside it — a hint that is long enough to matter wraps. */
  hint?: ReactNode
  htmlFor?: string
  children: ReactNode
}): ReactElement {
  const Label = htmlFor ? 'label' : 'div'
  return (
    <div style={{ marginBottom: 14 }}>
      <Label htmlFor={htmlFor} style={labelStyle}>
        {label}
      </Label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{children}</div>
      {hint && <div style={hintStyle}>{hint}</div>}
    </div>
  )
}

const labelStyle: CSSProperties = {
  display: 'block',
  marginBottom: 5,
  color: 'var(--ink-2)',
  font: 'var(--t-small) var(--font)'
}

export const hintStyle: CSSProperties = {
  marginTop: 4,
  color: 'var(--ink-3)',
  font: 'var(--t-small) var(--font)',
  lineHeight: 1.5
}

/** A text input in a field. Read-only ones look the same; they are still not disabled. */
export const inputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  boxSizing: 'border-box',
  height: 32,
  padding: '0 10px',
  borderRadius: 'var(--r-md)',
  border: '1px solid var(--surface-edge)',
  background: 'var(--surface-raised)',
  color: 'var(--ink)',
  font: 'var(--t-body) var(--font)'
}
