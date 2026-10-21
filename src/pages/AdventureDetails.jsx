import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { motion } from 'motion/react'
import {
  ArrowLeft,
  CarFront,
  CircleCheck,
  Clock,
  Footprints,
  IndianRupee,
  Info,
  Lightbulb,
  MapPin,
  Navigation,
  Play,
  Sparkles,
  Sun,
  Warehouse,
} from 'lucide-react'
import SmartImage from '../components/ui/SmartImage'
import Notice from '../components/ui/Notice'
import SaveButton from '../components/adventure/SaveButton'
import SafetyMeter from '../components/adventure/SafetyMeter'
import AdventureMap from '../components/map/AdventureMap'
import { CategoryBadge } from '../components/adventure/AdventureCard'
import { getAdventure, getHub } from '../data/adventures'
import { INTEREST_MAP } from '../data/options'
import { useOrbitStore } from '../store/useOrbitStore'
import { computeWindow, getBudget, planActivity, resolveStart } from '../lib/planner'
import { formatClock, formatCost, formatDistance, formatINR, formatMinutes } from '../lib/format'
import { buttonClass } from '../lib/ui'
import { useNow } from '../hooks/useNow'
import NotFound from './NotFound'

const FALLBACK_WINDOW = { durationOption: 60, buffer: 10, deadline: '' }

/** Builds the time plan for this activity using the user's preferences when they apply. */
function usePlan(activity) {
  const prefs = useOrbitStore((s) => s.preferences)
  const hasSearched = useOrbitStore((s) => s.hasSearched)

  return useMemo(() => {
    if (!activity) return null
    const notes = []
    let start = resolveStart(prefs.location)
    const activityHub = activity.hub ? getHub(activity.hub) : null

    // Viewing a place in another city (e.g. from Saved/Featured)? Plan from that city's station instead.
    if (activityHub && start.hub?.id !== activityHub.id) {
      start = { label: activityHub.name, coords: activityHub.coords, hub: activityHub, source: 'demo' }
      if (hasSearched) notes.push(`This place is in ${activityHub.city}, so timings are estimated from ${activityHub.name}.`)
    }

    let win = computeWindow(prefs)
    const personalised = hasSearched && !win.errors.length
    if (!personalised) {
      win = computeWindow({ ...prefs, ...FALLBACK_WINDOW })
      notes.push('Timings below assume a 60-minute window with a 10-minute buffer. Set your preferences for a personalised plan.')
    }

    const plan = planActivity(activity, start, win)
    const budget = getBudget(prefs)
    const overBudget = personalised && Number.isFinite(budget) && plan.totalCost > budget
    return { start, window: win, plan, notes, personalised, overBudget, budget }
  }, [activity, prefs, hasSearched])
}

export default function AdventureDetails() {
  const { id } = useParams()
  const activity = getAdventure(id)
  const planning = usePlan(activity)
  const navigate = useNavigate()
  const location = useLocation()
  const active = useOrbitStore((s) => s.active)
  const startAdventure = useOrbitStore((s) => s.startAdventure)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const now = useNow(15000)

  if (!activity) {
    return (
      <NotFound
        title="We couldn’t find that adventure"
        text="It may have been removed from the demo collection. Discover something new instead."
      />
    )
  }

  const { start, window: win, plan, notes, overBudget, budget } = planning
  const interest = INTEREST_MAP[activity.category]
  const TravelIcon = plan.travelMode === 'walk' ? Footprints : CarFront
  const otherActive = active && active.status !== 'completed' && active.activityId !== activity.id
  const sameActive = active && active.status !== 'completed' && active.activityId === activity.id

  // Preview of the timeline if the user starts now
  const startMs = now
  let returnBy = startMs + win.windowMinutes * 60000
  if (win.deadlineAt) returnBy = Math.min(returnBy, win.deadlineAt.getTime())
  const leaveBy = returnBy - (win.buffer + plan.travelOneWay) * 60000

  function begin() {
    if (otherActive && !confirmReplace) {
      setConfirmReplace(true)
      return
    }
    startAdventure({ activity, plan, window: win, startLabel: start.label, startCoords: start.coords })
    navigate('/adventure/live')
  }

  return (
    <div className="pb-10">
      {/* Hero */}
      <section className="relative">
        <SmartImage image={activity.image} alt={activity.name} width={1600} eager icon={interest?.icon} className="h-[340px] w-full sm:h-[420px]" />
        <div className="absolute inset-0 bg-linear-to-t from-navy via-navy/45 to-navy/10" />
        <div className="absolute inset-0">
          <div className="mx-auto flex h-full max-w-7xl flex-col justify-between px-4 py-6 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => (location.key !== 'default' ? navigate(-1) : navigate('/adventure/results'))}
              className="inline-flex h-11 w-fit cursor-pointer items-center gap-1.5 rounded-full bg-white/90 px-4 text-sm font-semibold text-navy shadow-sm backdrop-blur hover:bg-white"
            >
              <ArrowLeft className="size-4" /> Back
            </button>
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="text-white">
              <div className="flex flex-wrap items-center gap-2">
                <CategoryBadge id={activity.category} />
                {activity.generic && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-orange px-2.5 py-1 text-xs font-bold text-white">
                    <Lightbulb className="size-3.5" /> Idea for anywhere
                  </span>
                )}
              </div>
              <h1 className="mt-3 max-w-3xl text-4xl font-medium text-balance sm:text-5xl">{activity.name}</h1>
              <p className="mt-2 flex items-center gap-1.5 text-cream/85">
                <MapPin className="size-4" /> {activity.area}
                {activity.hub && <> · {getHub(activity.hub)?.city}</>}
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      <div className="mx-auto mt-10 grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_400px] lg:px-8">
        {/* Main content */}
        <div className="min-w-0 space-y-10">
          {notes.length > 0 && (
            <div className="space-y-2">
              {notes.map((n) => (
                <Notice key={n}>{n}</Notice>
              ))}
            </div>
          )}

          <section>
            <h2 className="text-2xl font-medium">About this adventure</h2>
            <p className="mt-3 text-lg leading-relaxed text-navy/80">{activity.description}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {activity.interests.map((i) => (
                <span key={i} className="rounded-full bg-sky-50 px-3 py-1 text-sm font-medium text-sky-600">
                  {INTEREST_MAP[i]?.label}
                </span>
              ))}
              {activity.indoor !== undefined && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-cream-200/70 px-3 py-1 text-sm font-medium text-navy">
                  {activity.indoor ? <Warehouse className="size-3.5" /> : <Sun className="size-3.5" />}
                  {activity.indoor ? 'Mostly indoors' : 'Outdoors'}
                </span>
              )}
            </div>
          </section>

          {(activity.kerala || activity.isAi || activity.live) && (
            <section className="rounded-3xl bg-white p-6 shadow-card ring-1 ring-navy/5" aria-labelledby="facts-title">
              <h2 id="facts-title" className="flex items-center gap-2 text-lg font-medium">
                <Info className="size-5 text-sky-600" /> What we know — and what we don’t
              </h2>
              <dl className="mt-4 grid gap-3 text-[15px] sm:grid-cols-2">
                <div>
                  <dt className="text-sm font-bold text-muted">Source</dt>
                  <dd>
                    {activity.isAi ? (
                      <span className="font-semibold text-amber-700">Gemini AI Curated (with real scraped photos)</span>
                    ) : activity.live ? (
                      'OpenStreetMap (live data)'
                    ) : (
                      'ORBIT curated list'
                    )}
                    {activity.osmUrl && (
                      <a href={activity.osmUrl} target="_blank" rel="noopener noreferrer" className="ml-2 font-bold text-sky-600 hover:underline">
                        View on OpenStreetMap<span className="sr-only"> (opens in a new tab)</span>
                      </a>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-bold text-muted">Location</dt>
                  <dd>{activity.isAi ? 'Coordinates verified by Gemini AI' : activity.live ? 'Mapped by OpenStreetMap contributors' : 'Approximate — verify on a map before you go'}</dd>
                </div>
                <div>
                  <dt className="text-sm font-bold text-muted">Typical visit</dt>
                  <dd>
                    {formatMinutes(activity.duration.min)}–{formatMinutes(activity.duration.max)} <span className="text-muted">(Estimated)</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-bold text-muted">Estimated cost & entry</dt>
                  <dd>
                    {activity.isAi
                      ? (activity.costNote || (activity.cost > 0 ? `₹${activity.cost}` : 'Free entry'))
                      : 'Price information unavailable · check locally'}
                  </dd>
                </div>
              </dl>
            </section>
          )}

          {(activity.highlights.length > 0 || activity.tips.length > 0) && (
          <section className="grid gap-5 sm:grid-cols-2">
            <div className="rounded-3xl bg-white p-6 shadow-card ring-1 ring-navy/5">
              <h3 className="flex items-center gap-2 text-lg font-bold">
                <Sparkles className="size-5 text-orange" /> Highlights
              </h3>
              <ul className="mt-4 space-y-2.5">
                {activity.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2.5 text-[15px]">
                    <CircleCheck className="mt-0.5 size-4 shrink-0 text-success-700" /> {h}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-3xl bg-white p-6 shadow-card ring-1 ring-navy/5">
              <h3 className="flex items-center gap-2 text-lg font-bold">
                <Lightbulb className="size-5 text-sky" /> Good to know
              </h3>
              <ul className="mt-4 space-y-2.5">
                {activity.tips.map((t) => (
                  <li key={t} className="flex items-start gap-2.5 text-[15px] leading-relaxed text-navy/85">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-sky" /> {t}
                  </li>
                ))}
              </ul>
            </div>
          </section>
          )}

          <section>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2 className="text-2xl font-medium">Getting there</h2>
              <p className="flex items-center gap-1.5 text-sm text-muted">
                <Navigation className="size-4 text-sky" /> From {start.label}
              </p>
            </div>
            {activity.coords && start.coords ? (
              <AdventureMap
                start={start}
                places={[{ id: activity.id, name: activity.name, coords: activity.coords, label: '★' }]}
                className="mt-4 h-80 sm:h-96"
              />
            ) : start.coords ? (
              <AdventureMap start={start} radiusKm={Math.max(0.3, plan.distanceKm)} className="mt-4 h-72" />
            ) : (
              <div className="mt-4 flex items-center gap-4 rounded-3xl bg-white p-6 ring-1 ring-navy/5">
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-sky-50 text-sky">
                  <MapPin className="size-6" />
                </span>
                <p className="text-[15px] text-muted">
                  This is a flexible idea — look for a spot within about <strong className="text-navy">{formatDistance(plan.distanceKm)}</strong> of
                  where you are. Use your current location on the preferences page to see it on a map.
                </p>
              </div>
            )}
            <p className="mt-3 text-sm text-muted">
              {plan.travelMode === 'walk'
                ? `About ${formatDistance(plan.distanceKm)} — roughly a ${plan.travelOneWay}-minute walk each way.`
                : `About ${formatDistance(plan.distanceKm)} — a ${plan.walkMinutes}-minute walk, so we suggest an auto/taxi (~${plan.travelOneWay} min, ~${formatINR(plan.transportCost / 2)} each way).`}{' '}
              Estimates only: based on straight-line distance with an allowance for streets, not a routed time. Check a maps app for
              the actual route.
            </p>
          </section>
        </div>

        {/* Plan sidebar */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-3xl bg-white p-6 shadow-lift ring-1 ring-navy/5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-orange-700">Your plan</p>
                <p className="mt-1 font-display text-4xl font-medium">{formatMinutes(plan.totalMinutes)}</p>
                <p className="text-sm text-muted">total, including travel</p>
              </div>
              <SaveButton id={activity.id} name={activity.name} className="shrink-0" />
            </div>

            <SafetyMeter safety={plan.safety} variant="full" className="mt-5" />

            <dl className="mt-6 grid grid-cols-2 gap-3">
              <Stat icon={Clock} label="Time to enjoy" value={formatMinutes(plan.activityMinutes)} />
              <Stat icon={TravelIcon} label={plan.travelMode === 'walk' ? 'Walk each way' : 'Ride each way'} value={`${plan.travelOneWay} min`} />
              <Stat icon={IndianRupee} label="Activity cost" value={formatCost(activity.cost)} sub={activity.costNote} />
              <Stat icon={CarFront} label="Transport" value={formatCost(plan.transportCost)} sub={plan.transportCost ? 'Round trip, approx.' : 'Walkable'} />
            </dl>

            <div className="mt-5 flex items-center justify-between rounded-2xl bg-cream px-4 py-3">
              <span className="text-sm font-medium text-muted">Estimated total</span>
              <span className="font-display text-xl font-bold">
                {plan.priceUnknown ? (plan.transportCost ? `${formatCost(plan.transportCost)} + entry (unknown)` : 'Unknown') : formatCost(plan.totalCost)}
              </span>
            </div>

            {plan.fitsTime && (
              <ol className="mt-6 space-y-3 border-l-2 border-dashed border-navy/10 pl-5 text-sm">
                <TimelineItem dot="bg-navy" time="Now" text={`Leave ${start.label}`} />
                <TimelineItem dot="bg-sky" time={formatClock(startMs + plan.travelOneWay * 60000)} text={`Arrive at ${activity.name}`} />
                <TimelineItem dot="bg-orange" time={formatClock(leaveBy)} text="Head back (reminder)" />
                <TimelineItem dot="bg-success" time={formatClock(returnBy - win.buffer * 60000)} text={`Back at ${start.label}`} />
                <TimelineItem dot="bg-navy/30" time={formatClock(returnBy)} text={`Deadline · ${win.buffer}-min buffer ends`} />
              </ol>
            )}

            <div className="mt-6 space-y-3">
              {!plan.fitsTime && (
                <Notice tone="warning">
                  This needs at least {formatMinutes(activity.duration.min + plan.travelOneWay * 2)} plus your buffer — more than your
                  current window. <Link to="/adventure" className="font-semibold underline">Adjust your time</Link>
                </Notice>
              )}
              {overBudget && (
                <Notice tone="warning">This is about {formatINR(plan.totalCost - budget)} over your budget.</Notice>
              )}
              {confirmReplace && otherActive && (
                <Notice tone="warning">
                  You already have a live adventure at <strong>{active.name}</strong>. Starting this one will end it.
                </Notice>
              )}

              {sameActive ? (
                <Link to="/adventure/live" className={buttonClass('dark', 'lg', 'w-full')}>
                  View live timer
                </Link>
              ) : (
                <button type="button" onClick={begin} disabled={!plan.fitsTime} className={buttonClass('primary', 'lg', 'w-full')}>
                  <Play className="size-5 fill-navy" /> {confirmReplace && otherActive ? 'End current & start this' : 'Start Adventure'}
                </button>
              )}
              <SaveButton id={activity.id} name={activity.name} variant="button" className="w-full" />
            </div>
            <p className="mt-4 text-center text-xs text-muted">Demo data — prices and timings are approximate.</p>
          </div>
        </aside>
      </div>
    </div>
  )
}

function Stat({ icon: Icon, label, value, sub }) {
  return (
    <div className="rounded-2xl p-3 ring-1 ring-navy/8">
      <dt className="flex items-center gap-1.5 text-xs font-medium text-muted">
        <Icon className="size-3.5 text-sky" /> {label}
      </dt>
      <dd className="mt-1 font-bold text-navy">{value}</dd>
      {sub && <dd className="text-xs leading-tight text-muted">{sub}</dd>}
    </div>
  )
}

function TimelineItem({ dot, time, text }) {
  return (
    <li className="relative">
      <span className={`absolute top-1 -left-[27px] size-3 rounded-full ring-4 ring-white ${dot}`} />
      <span className="font-bold text-navy tabular-nums">{time}</span> <span className="text-muted">· {text}</span>
    </li>
  )
}
