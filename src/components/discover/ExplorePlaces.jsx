import { useId, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import Chip from '../ui/Chip'
import PlaceCard from './PlaceCard'
import { DESTINATION_PLACES, EXPLORE_GROUPS } from '../../data/destinations'
import { allCachedPlaces } from '../../services/placeCache'
import { withDistance } from '../../utils/distanceUtils'
import { cn } from '../../lib/ui'

const norm = (s) => s.toLowerCase()

/** Worldwide destinations catalogue. */
export default function ExplorePlaces({ origin, onStartHere }) {
  const ids = { q: useId(), d: useId() }
  const [q, setQ] = useState('')
  const [district, setDistrict] = useState('')
  const [group, setGroup] = useState(null)
  const allPlaces = useMemo(() => (DESTINATION_PLACES.length > 0 ? DESTINATION_PLACES : allCachedPlaces()), [])
  const districts = useMemo(() => [...new Set(allPlaces.map((p) => p.district))].filter(Boolean).sort(), [allPlaces])

  const filtered = useMemo(() => {
    const term = norm(q.trim())
    const list = allPlaces.filter(
      (p) =>
        (!district || p.district === district) &&
        (!group || p.groups?.includes(group)) &&
        (!term || norm(p.name).includes(term) || norm(p.district || '').includes(term) || norm(p.description || '').includes(term)),
    )
    return origin?.coords ? withDistance(list, origin.coords) : list.map((p) => ({ ...p, distanceKm: null }))
  }, [allPlaces, q, district, group, origin])

  const byDistrict = useMemo(() => {
    const m = new Map()
    for (const p of filtered) m.set(p.district, [...(m.get(p.district) ?? []), p])
    return [...m.entries()]
  }, [filtered])

  return (
    <section aria-labelledby="explore-title">
      <h2 id="explore-title" className="text-2xl font-medium">
        Explore Destinations
      </h2>
      <p className="mt-1 text-sm text-muted">Browse destinations and places to visit around the world — then plan an adventure that fits your time and budget.</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_220px]">
        <div className="relative">
          <label htmlFor={ids.q} className="sr-only">
            Search destinations
          </label>
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted" />
          <input
            id={ids.q}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search landmarks, parks, cities…"
            className="h-12 w-full rounded-xl bg-white pr-4 pl-10 ring-1 ring-navy/15 focus:ring-2 focus:ring-sky focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor={ids.d} className="sr-only">
            Filter by city or destination
          </label>
          <select id={ids.d} value={district} onChange={(e) => setDistrict(e.target.value)} className="h-12 w-full cursor-pointer rounded-xl bg-white px-4 ring-1 ring-navy/15 focus:ring-2 focus:ring-sky focus:outline-none">
            <option value="">All cities & regions</option>
            {districts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div role="radiogroup" aria-label="Destination type" className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
        <Chip size="sm" selected={!group} onClick={() => setGroup(null)} className="shrink-0">
          All types
        </Chip>
        {EXPLORE_GROUPS.map((g) => (
          <Chip key={g.id} size="sm" selected={group === g.id} onClick={() => setGroup(g.id)} className="shrink-0">
            {g.label}
          </Chip>
        ))}
      </div>

      {byDistrict.length === 0 ? (
        <p className="mt-6 rounded-3xl bg-white p-8 text-center text-muted ring-1 ring-navy/5">No destinations match. Clear a filter to see more.</p>
      ) : (
        byDistrict.map(([d, list]) => (
          <div key={d} className="mt-8">
            <h3 className={cn('text-xl font-bold')}>
              {d} <span className="text-base font-medium text-muted">· {list.length}</span>
            </h3>
            <div className="mt-3 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((p, i) => (
                <PlaceCard key={p.id} place={p} index={i} onStartHere={onStartHere} />
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  )
}
