import type { ReactElement } from 'react'
import { Chip } from '@renderer/components/Chip'
import { FILTER_LABEL, FILTER_ORDER, type Filter } from '@renderer/lib/capture'
import { filters } from './styles'

/**
 * The chips that narrow the library, in one place because two surfaces wear them.
 *
 * They were three literals inside the list's header, which was fine while the list was
 * the only way to look at a capture. Browse mode needs the same set, and a filter that
 * exists in one view and not the other is a filter someone loses by switching views.
 *
 * Counts come from the caller: a chip that would empty the list should say so before it
 * is pressed, and only the caller knows what is listed.
 */
export function CaptureFilters({
  filter,
  counts,
  onFilter
}: {
  filter: Filter
  counts: Record<Filter, number>
  onFilter: (f: Filter) => void
}): ReactElement {
  return (
    <div style={filters}>
      {FILTER_ORDER.map((id) => (
        <Chip key={id} selected={filter === id} count={counts[id]} onClick={() => onFilter(id)}>
          {FILTER_LABEL[id]}
        </Chip>
      ))}
    </div>
  )
}
