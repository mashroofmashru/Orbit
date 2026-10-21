import { useEffect, useMemo, useState } from 'react'
import { LayoutGrid, Map as MapIcon, RefreshCw } from 'lucide-react'
import AdventureMap from '../map/AdventureMap'
import Notice from '../ui/Notice'
import PlaceCard, { PlaceCardSkeleton } from './PlaceCard'
import { fetchNearbyPlaces, OSM_ATTRIBUTION } from '../../services/nearbyPlacesService'
import { DESTINATION_PLACES as KERALA_PLACES } from '../../data/destinations'
import { withinRadius } from '../../utils/distanceUtils'
import { buttonClass, cn } from '../../lib/ui'

/** Places genuinely within the selected radius of the starting point, nearest first. */
export default function NearbyPlaces({ origin, radiusKm, onStartHere }) {
  const [state, setState] = useState({ key: null, status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [view, setView] = useState('list')
  const key = JSON.stringify([origin.coords, radiusKm, attempt])

  useEffect(() => {
    const ctrl = new AbortController()
    fetchNearbyPlaces({ coords: origin.coords, radiusKm }, { signal: ctrl.signal })
      .then((r) => setState({ key, status: 'ready', ...r }))
      .catch(() => !ctrl.signal.aborted && setState({ key, status: 'ready', places: [], mode: 'fallback', note: 'Something went wrong loading places.' }))
    return () => ctrl.abort()
  }, [key, origin.coords, radiusKm])

  const loading = state.key !== key
  // Curated places within the radius are shown immediately; live OpenStreetMap results replace them when they arrive
  const curatedNow = useMemo(() => withinRadius(KERALA_PLACES, origin.coords, radiusKm ?? 50), [origin.coords, radiusKm])
  const places = loading ? curatedNow : state.places

  return (
    <section aria-labelledby="nearby-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="nearby-title" className="text-2xl font-medium">
            Nearby {origin.label ? <span className="text-muted">· {origin.label}</span> : null}
          </h2>
          <p className="mt-1 text-sm text-muted" aria-live="polite">
            {loading
              ? `${places.length} curated place${places.length === 1 ? '' : 's'} so far · loading live OpenStreetMap places…`
              : `${places.length} place${places.length === 1 ? '' : 's'} within ${radiusKm ? `${radiusKm} km` : '50 km'} (straight-line), nearest first`}
          </p>
        </div>
        <div className="flex rounded-full bg-white p-1 ring-1 ring-navy/10" role="radiogroup" aria-label="View">
          {[
            { id: 'list', icon: LayoutGrid, label: 'List view' },
            { id: 'map', icon: MapIcon, label: 'Map view' },
          ].map((v) => (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={view === v.id}
              aria-label={v.label}
              onClick={() => setView(v.id)}
              className={cn('grid size-11 cursor-pointer place-items-center rounded-full sm:size-9', view === v.id ? 'bg-sky-600 text-white' : 'text-navy/70 hover:text-navy')}
            >
              <v.icon className="size-4" />
            </button>
          ))}
        </div>
      </div>

      {!loading && (
        <Notice tone={state.mode === 'fallback' ? 'warning' : 'info'} className="mt-4">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              {state.note}
              {state.mode !== 'fallback' && ' Curated ORBIT places are mixed in and labelled.'}
              {radiusKm == null || radiusKm > 25 ? ' Live search covers up to 25 km; beyond that, curated places only.' : ''}
            </span>
            {state.mode === 'fallback' && (
              <button type="button" onClick={() => setAttempt((n) => n + 1)} className={buttonClass('secondary', 'sm')}>
                <RefreshCw className="size-4" /> Try live results again
              </button>
            )}
          </span>
        </Notice>
      )}

      {view === 'map' && (
        <div className="mt-4">
          <AdventureMap
            start={{ coords: origin.coords, label: origin.label || 'Starting point' }}
            places={places.map((p, i) => ({ id: p.id, name: p.name, coords: p.coords, label: i + 1 }))}
            radiusKm={radiusKm ?? undefined}
            className="h-[420px]"
          />
          <p className="mt-2 text-xs text-muted">Map © OpenStreetMap contributors. Numbers match the list order. No routes are drawn.</p>
        </div>
      )}

      <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {places.map((p, i) => <PlaceCard key={p.id} place={p} index={i} onStartHere={onStartHere} />)}
        {loading && Array.from({ length: places.length ? 2 : 6 }, (_, i) => <PlaceCardSkeleton key={`sk${i}`} />)}
      </div>

      {!loading && places.length === 0 && (
        <div className="mt-4 rounded-3xl bg-white p-8 text-center ring-1 ring-navy/5">
          <p className="font-bold">Nothing found within this radius.</p>
          <p className="mt-1 text-muted">Try a larger radius, or browse Explore Destinations for spots further away.</p>
        </div>
      )}
      {!loading && state.mode !== 'fallback' && <p className="mt-4 text-xs text-muted">Live data {OSM_ATTRIBUTION}.</p>}
    </section>
  )
}
