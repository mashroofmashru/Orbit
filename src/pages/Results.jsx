import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, LayoutGrid, Map as MapIcon, RefreshCw, Search, SearchX, Sparkles } from 'lucide-react'
import AdventureMap from '../components/map/AdventureMap'
import Notice from '../components/ui/Notice'
import PageHero from '../components/ui/PageHero'
import PlaceCard, { PlaceCardSkeleton } from '../components/discover/PlaceCard'
import { fetchNearbyPlaces, OSM_ATTRIBUTION } from '../services/nearbyPlacesService'
import { nearestDistrict } from '../services/locationService'
import { computeWindow, getBudget, resolveStart } from '../lib/planner'
import { useOrbitStore } from '../store/useOrbitStore'
import { DESTINATION_PLACES as KERALA_PLACES } from '../data/destinations'
import { getCachedPlaces, getCachedQuery, setCachedQuery } from '../services/placeCache'
import { withDistance, withinRadius } from '../utils/distanceUtils'
import { buttonClass, cn } from '../lib/ui'

const PAGE_SIZE = 24
const isFood = (p) => Boolean(p.groups?.includes('food'))

const FILTERS = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'tourist', label: 'Tourist spots', test: (p) => !isFood(p) },
  { id: 'food', label: 'Food', test: isFood },
]
const SORTS = [
  { id: 'near', label: 'Nearest' },
  { id: 'name', label: 'A–Z' },
]

/** Tourist spots and food places for ANY selected location or coordinates — Gemini AI curated with real scraped images. */
export default function Results() {
  const prefs = useOrbitStore((s) => s.preferences)
  const location = prefs.location
  const [resolvedOrigin, setResolvedOrigin] = useState(null)
  const [state, setState] = useState({ key: null, status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [filter, setFilter] = useState('all')
  const [sortBy, setSortBy] = useState('near')
  const [query, setQuery] = useState('')
  const [view, setView] = useState('list')
  const [shown, setShown] = useState(PAGE_SIZE)

  // Starting location: resolved by Gemini, or user GPS coords, or resolved label, or typed text
  const origin = useMemo(() => {
    if (resolvedOrigin?.coords) return resolvedOrigin
    if (location?.coords) {
      return {
        label: location.label || 'Current location',
        coords: location.coords,
      }
    }
    const resolved = resolveStart(location)
    if (resolved?.coords) {
      return {
        label: resolved.label || location?.label || 'your starting point',
        coords: resolved.coords,
      }
    }
    const typed = (location?.label || '').trim()
    return {
      label: typed || 'your location',
      coords: null,
    }
  }, [location, resolvedOrigin])

  const districtName = useMemo(() => {
    if (resolvedOrigin?.label) return resolvedOrigin.label.split(',')[0].trim()
    const cleanTyped = (location?.label || '').trim()
    if (cleanTyped && !cleanTyped.toLowerCase().startsWith('current location') && cleanTyped !== 'your starting point') {
      return cleanTyped.split(',')[0].trim()
    }
    if (origin.coords) {
      const near = nearestDistrict(origin.coords)
      if (near?.name) return near.name
    }
    return cleanTyped || 'your location'
  }, [origin.coords, location?.label, resolvedOrigin])

  const win = useMemo(() => computeWindow(prefs, new Date()), [prefs])
  const durationMinutes = Number.isFinite(win.windowMinutes) && win.windowMinutes > 0
    ? win.windowMinutes
    : (prefs.durationOption === 'custom' ? Number(prefs.customDuration) : Number(prefs.durationOption || 60))
  const budget = getBudget(prefs)

  const moodsList = Array.isArray(prefs.moods) && prefs.moods.length > 0 ? prefs.moods : (prefs.mood ? [prefs.mood] : [])
  const moodString = moodsList.join(', ')
  const interestsList = useMemo(() => (Array.isArray(prefs.interests) ? prefs.interests : []), [prefs.interests])
  const interestsString = interestsList.slice().sort().join(',')

  const rawLabel = (location?.label || '').trim().toLowerCase()
  const inputOriginKey = location?.source === 'geo' && location?.coords
    ? `geo-${Number(location.coords[0]).toFixed(3)},${Number(location.coords[1]).toFixed(3)}`
    : (rawLabel ? `text-${rawLabel}` : (location?.coords ? `${Number(location.coords[0]).toFixed(3)},${Number(location.coords[1]).toFixed(3)}` : 'default-location'))

  const queryKey = `${inputOriginKey}-${durationMinutes}-${budget}-${moodString || 'any'}-${interestsString || 'all'}`
  const stateKey = `${inputOriginKey}-${attempt}`

  useEffect(() => {
    const ctrl = new AbortController()

    async function loadAdventurePlaces() {
      // 1. Try local cached places first for instant display
      const cached = getCachedQuery(queryKey)
      if (cached?.ids?.length > 0) {
        const cachedPlaces = getCachedPlaces(cached.ids)
        if (cachedPlaces.length > 0 && !ctrl.signal.aborted) {
          setState({
            key: stateKey,
            status: 'ready',
            places: cachedPlaces,
            mode: 'ai',
            model: 'cached',
            note: `Showing saved recommendations for your ${durationMinutes}-minute window & ₹${budget} budget.`,
          })
          return
        }
      }

      // 2. Fetch recommendations from Gemini AI with real scraped photos
      try {
        const aiRes = await fetch('/api/adventure/suggest', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Orbit-Client': '1',
          },
          body: JSON.stringify({
            location: location?.label || origin.label,
            coords: location?.coords || origin.coords,
            durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : 60,
            buffer: prefs.buffer || 10,
            budget: Number.isFinite(budget) ? budget : 500,
            interests: interestsList,
            mood: moodString,
          }),
          signal: ctrl.signal,
        })

        if (aiRes.ok) {
          const data = await aiRes.json()
          if (data?.places?.length > 0) {
            setCachedQuery(queryKey, data.places)
            if (!ctrl.signal.aborted) {
              setState({
                key: stateKey,
                status: 'ready',
                places: data.places,
                mode: 'ai',
                model: data.model,
                note: `AI-curated by Gemini (${data.model}) for your ${durationMinutes}-minute window & ₹${budget} budget.`,
              })
              if (data?.origin?.coords) {
                setResolvedOrigin(data.origin)
              }
            }
            return
          }
        }
      } catch (aiErr) {
        if (ctrl.signal.aborted) return
        console.warn('[Results] Gemini AI suggest failed, checking curated spots and OSM:', aiErr)
      }

      // 3. Fallback to curated destinations within radius if coordinates are available
      if (origin.coords) {
        const curatedNear = withinRadius(KERALA_PLACES, origin.coords, 45)
        if (curatedNear.length > 0) {
          if (!ctrl.signal.aborted) {
            setState({
              key: stateKey,
              status: 'ready',
              places: curatedNear,
              mode: 'fallback',
              note: `Showing handpicked spots near ${districtName}.`,
            })
          }
          return
        }

        // 4. Fallback to OpenStreetMap if AI service is unavailable
        try {
          const osmRes = await fetchNearbyPlaces({ coords: origin.coords, radiusKm: 25 }, { signal: ctrl.signal })
          if (!ctrl.signal.aborted) {
            if (osmRes.places?.length > 0) {
              setState({ key: stateKey, status: 'ready', ...osmRes })
              return
            }
          }
        } catch {
          // ignore
        }
      }

      // 5. If AI and coordinate fallbacks are not available
      if (!ctrl.signal.aborted) {
        setState({
          key: stateKey,
          status: 'ready',
          places: [],
          mode: 'fallback',
          note: `We couldn't reach the search service for "${districtName}". Please check your connection or try again.`,
        })
      }
    }

    loadAdventurePlaces()
    return () => ctrl.abort()
  }, [attempt, inputOriginKey, stateKey, queryKey, durationMinutes, budget, interestsString, moodString, prefs.buffer, location?.label, location?.coords, origin.label, origin.coords, interestsList, districtName])

  const loading = state.key !== stateKey
  const activePlaces = useMemo(() => {
    return loading ? [] : (state.places || [])
  }, [loading, state.places])
  const effectiveCoords = origin.coords
  const withKm = useMemo(() => {
    if (!effectiveCoords) return activePlaces.map((p) => ({ ...p, distanceKm: null }))
    return withDistance(activePlaces, effectiveCoords)
  }, [activePlaces, effectiveCoords])

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, withKm.filter(f.test).length])), [withKm])
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const test = FILTERS.find((f) => f.id === filter).test
    const list = withKm.filter((p) => test(p) && (!q || p.name.toLowerCase().includes(q) || p.kind?.toLowerCase().includes(q)))
    return sortBy === 'name' ? [...list].sort((a, b) => a.name.localeCompare(b.name)) : list
  }, [withKm, filter, query, sortBy])
  const page = visible.slice(0, shown)

  // A new filter, search or sort starts from the first page again
  const choose = (setter) => (value) => {
    setter(value)
    setShown(PAGE_SIZE)
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <Link to="/adventure" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-sky-600 hover:underline">
        <ArrowLeft className="size-4" /> Edit preferences
      </Link>

      <PageHero
        className="mt-2"
        eyebrow={districtName}
        titleProps={{ 'aria-live': 'polite' }}
        title={
          loading
            ? `Finding places in ${districtName}`
            : `${withKm.length} places to explore in ${districtName}`
        }
        description={
          loading
            ? `Finding places you can visit within ${durationMinutes} minutes from ${origin.label}…`
            : `Handpicked places and experiences fitting your ${durationMinutes}-minute window and ₹${budget} budget, with scraped photos.`
        }
        mascot={
          loading
            ? { state: 'thinking', message: `Analyzing your ${durationMinutes}-minute window and gathering places in ${districtName}` }
            : { state: 'success', message: `Found ${withKm.length} spots tailored to your preferences!` }
        }
      />

      {!loading && (
        <Notice tone={state.mode === 'fallback' ? 'warning' : 'info'} className="mt-6">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              {state.mode === 'ai' ? (
                <>
                  <span className="inline-flex items-center gap-1 font-bold text-amber-700">
                    <Sparkles className="size-4" /> Gemini AI Recommendations:
                  </span>{' '}
                  Places visitable within your {durationMinutes}-minute window (accounting for travel time & visit duration) under ₹{budget}. Real photos scraped from Wikipedia / Wikimedia.
                </>
              ) : (
                <>
                  {state.note} Distances are straight-line from {origin.label}.
                </>
              )}
            </span>
            {(state.mode === 'fallback' || state.mode === 'ai') && (
              <button type="button" onClick={() => setAttempt((n) => n + 1)} className={buttonClass('secondary', 'sm')}>
                <RefreshCw className="size-4" /> Refresh suggestions
              </button>
            )}
          </span>
        </Notice>
      )}

      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="radiogroup" aria-label="Type of place" className="grid w-full grid-cols-3 rounded-full bg-white p-1 ring-1 ring-navy/10 sm:flex sm:w-auto">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={filter === f.id}
              onClick={() => choose(setFilter)(f.id)}
              className={cn(
                'h-11 cursor-pointer rounded-full px-2 text-sm font-semibold whitespace-nowrap transition-colors sm:h-9 sm:px-4',
                filter === f.id ? 'bg-navy text-white' : 'text-navy/70 hover:text-navy',
              )}
            >
              {f.label}
              {!loading && <span className={cn('ml-1.5 tabular-nums', filter === f.id ? 'text-white/70' : 'text-muted')}>{counts[f.id]}</span>}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="relative w-full sm:w-64">
            <span className="sr-only">Search places</span>
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => choose(setQuery)(e.target.value)}
              placeholder="Search by name or type"
              className="h-11 w-full rounded-full bg-white pr-4 pl-10 text-[16px] ring-1 ring-navy/10 outline-none focus-visible:ring-2 focus-visible:ring-sky sm:h-10 sm:text-sm"
            />
          </label>
          <div role="radiogroup" aria-label="Sort places" className="flex rounded-full bg-white p-1 ring-1 ring-navy/10">
            {SORTS.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={sortBy === s.id}
                onClick={() => choose(setSortBy)(s.id)}
                className={cn(
                  'h-11 cursor-pointer rounded-full px-3.5 text-sm font-semibold whitespace-nowrap transition-colors sm:h-8',
                  sortBy === s.id ? 'bg-navy text-white' : 'text-navy/70 hover:text-navy',
                )}
              >
                {s.label}
              </button>
            ))}
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
                title={v.label}
                onClick={() => setView(v.id)}
                className={cn('grid size-11 cursor-pointer place-items-center rounded-full sm:size-8', view === v.id ? 'bg-sky-600 text-white' : 'text-navy/70 hover:text-navy')}
              >
                <v.icon className="size-4" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {!loading && (
        <p className="mt-4 text-sm text-muted" aria-live="polite">
          Showing {page.length} of {visible.length} {visible.length === 1 ? 'place' : 'places'}
          {sortBy === 'near' ? ', nearest first' : ', A–Z'}
        </p>
      )}

      {view === 'map' && !loading && page.length > 0 && origin.coords && (
        <div className="mt-4">
          <AdventureMap
            start={{ coords: origin.coords, label: origin.label }}
            places={page.map((p, i) => ({ id: p.id, name: p.name, coords: p.coords, label: i + 1 }))}
            className="h-[460px]"
          />
          <p className="mt-2 text-xs text-muted">Map © OpenStreetMap contributors. Numbers match the list order below. No routes are drawn.</p>
        </div>
      )}

      <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {loading
          ? Array.from({ length: 6 }, (_, i) => <PlaceCardSkeleton key={i} />)
          : page.map((p, i) => <PlaceCard key={p.id} place={p} index={i} />)}
      </div>

      {!loading && visible.length === 0 && (
        <div className="mx-auto mt-4 max-w-2xl rounded-3xl bg-white p-10 text-center ring-1 ring-navy/5">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-cream text-muted">
            <SearchX className="size-7" />
          </span>
          <h2 className="mt-5 text-2xl font-medium">No places match</h2>
          <p className="mt-2 text-muted">Try a different search, or switch to All.</p>
        </div>
      )}

      {page.length < visible.length && (
        <div className="mt-8 text-center">
          <button type="button" onClick={() => setShown((n) => n + PAGE_SIZE)} className={buttonClass('secondary', 'md')}>
            Show more places ({visible.length - page.length} left)
          </button>
        </div>
      )}

      {!loading && state.mode !== 'ai' && state.mode !== 'fallback' && <p className="mt-8 text-center text-xs text-muted">Live data {OSM_ATTRIBUTION}. Opening hours and prices aren’t included — please check locally.</p>}
    </div>
  )
}
