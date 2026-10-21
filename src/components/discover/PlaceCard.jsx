import { Link } from 'react-router'
import { motion } from 'motion/react'
import { ArrowRight, BadgeCheck, CarFront, Clock, Footprints, LocateFixed, MapPin, Radio, Ruler, Sparkles, Tag } from 'lucide-react'
import DestinationArt from '../trips/DestinationArt'
import SmartImage from '../ui/SmartImage'
import SaveButton from '../adventure/SaveButton'
import { CategoryBadge } from '../adventure/AdventureCard'
import { placeToActivity } from '../../data/keralaActivities'
import { estimateFromStraightLine } from '../../lib/planner'
import { formatINR, formatMinutes } from '../../lib/format'
import { formatKm } from '../../utils/distanceUtils'
import { buttonClass, cn } from '../../lib/ui'

/** One place (curated, live or AI-suggested). Clearly separates known facts, estimates and unavailable information. */
export default function PlaceCard({ place, onStartHere, index = 0 }) {
  const travel = place.distanceKm != null ? estimateFromStraightLine(place.distanceKm) : null
  const TravelIcon = travel?.mode === 'walk' ? Footprints : CarFront
  const activity = placeToActivity(place)
  const image = place.imageUrl || place.image

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index, 8) * 0.04 }}
      className="group relative flex flex-col overflow-hidden rounded-3xl bg-white shadow-card ring-1 ring-navy/5 transition-shadow hover:shadow-lift"
    >
      <div className="relative">
        {image ? (
          <SmartImage image={image} alt={place.name} className="aspect-[16/8] w-full" />
        ) : (
          <DestinationArt seed={place.name} className="aspect-[16/8]" />
        )}
        <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            <CategoryBadge id={place.category} />
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold shadow-sm',
                place.live
                  ? 'bg-mint text-navy'
                  : place.isAi
                  ? 'bg-amber-100 text-amber-950 ring-1 ring-amber-300'
                  : 'bg-white/95 text-navy',
              )}
            >
              {place.live ? (
                <Radio className="size-3.5" />
              ) : place.isAi ? (
                <Sparkles className="size-3.5 text-amber-600" />
              ) : (
                <BadgeCheck className="size-3.5 text-sky-600" />
              )}
              {place.live ? 'Live · OpenStreetMap' : place.isAi ? 'AI Curated · Gemini' : 'ORBIT curated'}
            </span>
          </div>
          <SaveButton id={place.id} name={place.name} snapshot={place.live || place.isAi ? activity : undefined} />
        </div>
        <span className="absolute bottom-2 left-3 rounded-full bg-navy/70 px-2 py-0.5 text-[12px] text-white">
          {image ? 'Photo' : 'Illustration'}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <p className="flex items-center gap-1 text-xs font-bold tracking-wide text-muted uppercase">
          <MapPin className="size-3.5" /> {place.live ? `Near ${place.district}` : place.district}
        </p>
        <h3 className="mt-1 text-xl font-bold">
          <Link to={`/adventure/${place.id}`} className="after:absolute after:inset-0">
            {place.name}
          </Link>
        </h3>
        <p className="mt-1.5 line-clamp-2 text-[15px] text-muted">{place.description}</p>

        <dl className="mt-4 space-y-1.5 text-sm">
          <div className="flex items-start gap-2">
            <dt className="sr-only">Distance</dt>
            <Ruler className="mt-0.5 size-4 shrink-0 text-sky-600" aria-hidden="true" />
            <dd>{place.distanceKm != null ? formatKm(place.distanceKm) : 'Distance unavailable — choose a starting point'}</dd>
          </div>
          {place.travelMinutes != null ? (
            <div className="flex items-start gap-2">
              <dt className="sr-only">Estimated travel time</dt>
              <CarFront className="mt-0.5 size-4 shrink-0 text-sky-600" aria-hidden="true" />
              <dd>
                ≈ {formatMinutes(place.travelMinutes)} travel{' '}
                <span className="text-muted">(one-way estimate)</span>
              </dd>
            </div>
          ) : travel ? (
            <div className="flex items-start gap-2">
              <dt className="sr-only">Estimated travel time</dt>
              <TravelIcon className="mt-0.5 size-4 shrink-0 text-sky-600" aria-hidden="true" />
              <dd>
                ≈ {formatMinutes(travel.minutes)} {travel.mode === 'walk' ? 'walk' : 'by auto/taxi'}{' '}
                <span className="text-muted">(estimate, not a routed time)</span>
              </dd>
            </div>
          ) : null}
          <div className="flex items-start gap-2">
            <dt className="sr-only">Typical visit</dt>
            <Clock className="mt-0.5 size-4 shrink-0 text-sky-600" aria-hidden="true" />
            <dd>
              {place.visitMinutes ? `${formatMinutes(place.visitMinutes.min)}–${formatMinutes(place.visitMinutes.max)} visit` : 'Visit length unavailable'}{' '}
              <span className="text-muted">(estimate)</span>
            </dd>
          </div>
          <div className="flex items-start gap-2">
            <dt className="sr-only">Price</dt>
            <Tag className={cn('mt-0.5 size-4 shrink-0', place.cost != null ? 'text-emerald-600' : 'text-muted')} aria-hidden="true" />
            <dd className={place.cost != null ? 'font-medium text-emerald-800' : 'text-muted'}>
              {place.costNote || (place.cost != null ? (place.cost === 0 ? 'Free entry' : formatINR(place.cost)) : 'Price information unavailable')}
            </dd>
          </div>
        </dl>
        {!place.live && (
          <p className="mt-2 text-xs text-muted">
            {place.isAi ? 'Suggested by Gemini AI based on your preferences' : `Location approximate${place.alsoInOsm ? ' · also listed in OpenStreetMap' : ''}`}
          </p>
        )}

        <div className="relative z-10 mt-auto flex flex-wrap gap-2 pt-4">
          <Link to={`/adventure/${place.id}`} className={buttonClass('dark', 'sm')}>
            View details <ArrowRight className="size-4" />
          </Link>
          {onStartHere && (
            <button type="button" onClick={() => onStartHere(place)} className={buttonClass('secondary', 'sm')}>
              <LocateFixed className="size-4" /> Explore around here
            </button>
          )}
        </div>
      </div>
    </motion.article>
  )
}

export function PlaceCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-3xl bg-white ring-1 ring-navy/5" aria-hidden="true">
      <div className="aspect-[16/8] animate-pulse bg-navy/8" />
      <div className="space-y-3 p-5">
        <div className="h-3 w-24 animate-pulse rounded-full bg-navy/8" />
        <div className="h-5 w-3/4 animate-pulse rounded-full bg-navy/10" />
        <div className="h-3 w-full animate-pulse rounded-full bg-navy/6" />
        <div className="h-3 w-2/3 animate-pulse rounded-full bg-navy/6" />
      </div>
    </div>
  )
}
