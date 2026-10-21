import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import Notice from '../components/ui/Notice'
import { ArrowRight, Compass, Map as MapIcon } from 'lucide-react'
import PageHero from '../components/ui/PageHero'
import LocationSelector from '../components/discover/LocationSelector'
import NearbyPlaces from '../components/discover/NearbyPlaces'
import ExploreKerala from '../components/discover/ExploreKerala'
import { useOrbitStore } from '../store/useOrbitStore'
import { buttonClass, cn } from '../lib/ui'

const TABS = [
  { id: 'nearby', label: 'Nearby', icon: Compass },
  { id: 'explore', label: 'Explore Destinations', icon: MapIcon },
]

export default function DiscoverKerala() {
  const navigate = useNavigate()
  const location = useOrbitStore((s) => s.preferences.location)
  const radius = useOrbitStore((s) => s.preferences.discoveryRadiusKm ?? 10)
  const update = useOrbitStore((s) => s.updatePreferences)
  const markSearched = useOrbitStore((s) => s.markSearched)
  const [tab, setTab] = useState('nearby')
  const routeState = useLocation().state

  // "Explore around here": the place becomes the starting point, and we switch to Nearby
  function startHere(place) {
    update({ location: { label: place.name, coords: place.coords, source: 'manual' } })
    setTab('nearby')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function planAdventure() {
    markSearched()
    navigate('/adventure/results')
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <PageHero
        eyebrow="Discover Worldwide"
        title="Real places around you"
        description="Find what’s genuinely nearby, or explore destinations across the world — then plan an adventure that fits your time and budget."
        mascot={{ state: 'welcome', message: 'Where shall we explore?' }}
      >
        {location.coords && (
          <button type="button" onClick={planAdventure} className={buttonClass('primary', 'lg')}>
            Find adventures that fit my time <ArrowRight className="size-5" />
          </button>
        )}
      </PageHero>

      {routeState?.locateFailed && !location.coords && (
        <Notice tone="warning" className="mt-6">
          We couldn’t use your current location. Choose a city or search for a place below.
        </Notice>
      )}

      <div className="mt-6">
        <LocationSelector />
      </div>

      <div role="tablist" aria-label="Discovery mode" className="mt-8 flex w-fit rounded-full bg-white p-1 ring-1 ring-navy/10">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={cn('inline-flex h-11 cursor-pointer items-center gap-2 rounded-full px-5 font-bold', tab === t.id ? 'bg-navy text-white' : 'text-navy/75 hover:text-navy')}
          >
            <t.icon className="size-4" /> {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'nearby' ? (
          location.coords ? (
            <NearbyPlaces origin={location} radiusKm={radius} onStartHere={startHere} />
          ) : (
            <div className="rounded-3xl bg-white p-8 text-center ring-1 ring-navy/5">
              <p className="text-lg font-bold">Choose a starting point to see what’s nearby</p>
              <p className="mt-1 text-muted">Use your current location, pick a city, or search above. Or browse popular destinations:</p>
              <button type="button" onClick={() => setTab('explore')} className={buttonClass('secondary', 'md', 'mt-4')}>
                Explore Destinations
              </button>
            </div>
          )
        ) : (
          <ExploreKerala origin={location} onStartHere={startHere} />
        )}
      </div>

      <p className="mt-10 text-center text-sm text-muted">
        Prefer the classic planner? <Link to="/adventure" className="font-bold text-sky-600 hover:underline">Set your time and budget</Link>
      </p>
    </div>
  )
}
