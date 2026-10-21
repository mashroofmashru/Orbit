import { useId, useState } from 'react'
import { LoaderCircle, LocateFixed, MapPin, Search, X } from 'lucide-react'
import Notice from '../ui/Notice'
import { KERALA_DISTRICTS } from '../../data/keralaPlaces'
import { useGeolocation } from '../../hooks/useGeolocation'
import { describeCurrentLocation, searchLocal, searchOnline } from '../../services/locationService'
import { useOrbitStore } from '../../store/useOrbitStore'
import { buttonClass, cn } from '../../lib/ui'

const RADIUS_OPTIONS = [
  { km: 5, label: '5 km' },
  { km: 10, label: '10 km' },
  { km: 25, label: '25 km' },
  { km: 50, label: '50 km' },
  { km: null, label: 'All nearby' },
]

const inputCls = 'h-12 w-full rounded-xl bg-white px-4 text-[15px] text-navy ring-1 ring-navy/15 focus:ring-2 focus:ring-sky focus:outline-none'

/**
 * The single place to set the discovery/adventure starting point. Writes to preferences.location,
 * which the recommendation engine already uses — no second, conflicting location state.
 */
export default function LocationSelector() {
  const location = useOrbitStore((s) => s.preferences.location)
  const radius = useOrbitStore((s) => s.preferences.discoveryRadiusKm ?? 10)
  const update = useOrbitStore((s) => s.updatePreferences)
  const geo = useGeolocation()
  const ids = { district: useId(), search: useId() }
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null) // null = no search yet
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(null)

  const setStart = (label, coords) => update({ location: { label, coords, source: 'manual' } })

  async function useCurrent() {
    const coords = await geo.request()
    if (!coords) return
    const { label } = describeCurrentLocation(coords)
    update({ location: { label, coords, source: 'geo' } })
  }

  async function submitSearch(e) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    setSearchError(null)
    const local = searchLocal(q)
    setResults(local)
    // Online search only on explicit submit (Nominatim policy: no autocomplete), and only if we need more
    if (q.length >= 3) {
      setSearching(true)
      try {
        const online = await searchOnline(q)
        setResults([...local, ...online.filter((o) => !local.some((l) => l.label.toLowerCase() === o.label.toLowerCase()))])
      } catch (err) {
        setSearchError(`${err.message} You can still pick a city below.`)
      } finally {
        setSearching(false)
      }
    }
  }

  const geoTone = { granted: 'success', denied: 'error', unavailable: 'warning', timeout: 'warning', unsupported: 'warning' }[geo.status]

  return (
    <section aria-labelledby="loc-title" className="rounded-3xl bg-white p-5 shadow-card ring-1 ring-navy/5 sm:p-6">
      <h2 id="loc-title" className="text-xl font-medium">
        Where are you starting from?
      </h2>

      <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-cream px-4 py-3">
        <p className="flex min-w-0 items-center gap-2 font-semibold">
          <MapPin className="size-5 shrink-0 text-orange-700" />
          <span className="truncate">{location.coords ? location.label : 'No starting point selected yet'}</span>
        </p>
        {location.coords && (
          <button type="button" onClick={() => update({ location: { label: '', coords: null, source: 'manual' } })} className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-muted hover:bg-white" aria-label="Clear starting point">
            <X className="size-4" />
          </button>
        )}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[auto_1fr]">
        <button type="button" onClick={useCurrent} disabled={geo.status === 'requesting'} className={buttonClass('dark', 'md')}>
          {geo.status === 'requesting' ? <LoaderCircle className="size-4 animate-spin" /> : <LocateFixed className="size-4" />}
          {geo.status === 'requesting' ? 'Finding you…' : 'Use My Current Location'}
        </button>
        <div>
          <label htmlFor={ids.district} className="sr-only">
            Choose a city or destination
          </label>
          <select
            id={ids.district}
            value={KERALA_DISTRICTS.find((d) => d.name === location.label)?.id ?? ''}
            onChange={(e) => {
              const d = KERALA_DISTRICTS.find((x) => x.id === e.target.value)
              if (d) setStart(d.name, d.coords)
            }}
            className={cn(inputCls, 'cursor-pointer')}
          >
            <option value="">Choose a popular destination…</option>
            {KERALA_DISTRICTS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {geo.message && geo.status !== 'requesting' && geoTone && (
        <Notice tone={geoTone} className="mt-3">
          {geo.status === 'granted' ? 'Location found. Showing places around you.' : `${geo.message} Choose a city above or search below.`}
        </Notice>
      )}

      <form onSubmit={submitSearch} className="mt-4 flex gap-2" role="search">
        <label htmlFor={ids.search} className="sr-only">
          Search for a place in Kerala
        </label>
        <input id={ids.search} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a place, e.g. Beypore" className={inputCls} />
        <button type="submit" disabled={searching || !query.trim()} className={buttonClass('dark', 'md', 'shrink-0')}>
          {searching ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />} Search
        </button>
      </form>
      {searchError && (
        <Notice tone="warning" className="mt-3">
          {searchError}
        </Notice>
      )}
      {results && (
        <div className="mt-3">
          {results.length === 0 && !searching ? (
            <p className="text-sm text-muted">No matches in Kerala. Try a district name like “Kozhikode”.</p>
          ) : (
            <ul className="space-y-1.5" aria-label="Search results">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setStart(r.label, r.coords)
                      setResults(null)
                      setQuery('')
                    }}
                    className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-xl px-3 text-left hover:bg-cream"
                  >
                    <span>
                      <span className="block font-semibold">{r.label}</span>
                      <span className="block text-xs text-muted">{r.detail}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted">{r.source}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted">Search results © OpenStreetMap contributors (Nominatim). Searches run only when you press Search.</p>
        </div>
      )}

      <fieldset className="mt-5">
        <legend className="text-sm font-bold">Nearby radius</legend>
        <div role="radiogroup" aria-label="Nearby radius" className="mt-2 flex flex-wrap gap-2">
          {RADIUS_OPTIONS.map((r) => (
            <button
              key={r.label}
              type="button"
              role="radio"
              aria-checked={radius === r.km}
              onClick={() => update({ discoveryRadiusKm: r.km })}
              className={cn(
                'h-11 cursor-pointer rounded-full px-4 text-sm font-bold ring-1 sm:h-9',
                radius === r.km ? 'bg-navy text-white ring-navy' : 'bg-white text-navy ring-navy/15 hover:ring-sky',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </fieldset>
    </section>
  )
}
