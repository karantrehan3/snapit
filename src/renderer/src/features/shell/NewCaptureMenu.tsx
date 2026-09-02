import type { ReactElement } from 'react'
import type { Settings } from '@preload/index'
import { Menu, type MenuItem } from '@renderer/components/Menu'
import { captureActions } from './captureActions'

/**
 * The one control that starts anything.
 *
 * It sits at the top of the sidebar, where an application's create action goes, and it
 * replaced a row of icon-only buttons in the top bar. Those were the wrong answer twice
 * over: three rectangles with something inside them cannot be told apart, and the chords
 * they exist to teach were hidden in tooltips where nobody reads them.
 *
 * Every item carries its chord, so using the menu is also how you stop needing it — which
 * is the right outcome for a tool whose real interface is three global hotkeys.
 *
 * "Open an image" is in here too, below a rule, because it is adjacent but not a capture:
 * it opens a picture that already exists rather than making a new one.
 */
export function NewCaptureMenu({ settings }: { settings: Settings | null }): ReactElement {
  const actions = captureActions(settings)

  const items: MenuItem[] = []
  for (const action of actions) {
    // The rule separates making something from opening something.
    if (action.aside && items.length > 0) items.push({ kind: 'separator', key: `sep-${action.key}` })
    items.push({
      key: action.key,
      label: action.label,
      icon: action.icon,
      hint: action.hint,
      keys: action.keys,
      primary: action.primary,
      onSelect: action.run
    })
  }

  return (
    <Menu variant="primary" icon="plus" items={items} style={{ width: '100%', justifyContent: 'flex-start' }}>
      New capture
    </Menu>
  )
}
