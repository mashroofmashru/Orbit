import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { motion } from 'motion/react'
import { Activity, ArrowRight, CalendarClock, CircleAlert, LoaderCircle, Plus, ShieldQuestion } from 'lucide-react'
import Mascot from '../components/mascot/Mascot'
import { ReadinessRing } from '../components/game/GameUI'
import DestinationArt from '../components/trips/DestinationArt'
import Notice from '../components/ui/Notice'
import { countdown, countryName, formatDeparture } from '../data/trips'
import { api } from '../services/orbitApi'
import { useNow } from '../hooks/useNow'
import { buttonClass, cn } from '../lib/ui'

function tripStatus(trip, now) {
  if (trip.departureAt <= now) return { label: 'Departed', cls: 'bg-cream-200 text-muted' }
  if (trip.readiness.completionPct === 100) return { label: 'Packed', cls: 'bg-success-50 text-success-700' }
  if (trip.readiness.completionPct >= 50) return { label: 'In progress', cls: 'bg-sky-50 text-sky-600' }
  return { label: 'Getting started', cls: 'bg-orange-50 text-orange-700' }
}

const relTime = (ms) => {
  const mins = Math.round((Date.now() - ms) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const h = Math.round(mins / 60)
  if (h < 24) return `${h} hr ago`
  return new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export function TripCard({ trip, now }) {
  const st = tripStatus(trip, now)
  const ms = trip.departureAt - now
  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="group relative overflow-hidden rounded-3xl bg-white shadow-card ring-1 ring-navy/5 transition-shadow hover:shadow-lift"
    >
      <DestinationArt seed={trip.destinationCity + trip.destinationCountry} label={trip.destinationCity} className="aspect-[16/8]" />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-xl font-bold">
              <Link to={`/trips/${trip.id}`} className="after:absolute after:inset-0">
                {trip.name || `Trip to ${trip.destinationCity}`}
              </Link>
            </h3>
            <p className="text-sm text-muted">
              {trip.departureCity ? `${trip.departureCity} → ` : ''}{trip.destinationCity}, {countryName(trip.destinationCountry)}
            </p>
          </div>
          <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-bold', st.cls)}>{st.label}</span>
        </div>
        <div className="mt-4 flex items-center gap-4">
          <ReadinessRing score={trip.readiness.score} size={72} stroke={8} label="Ready" />
          <dl className="grid flex-1 gap-1.5 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-muted">Departs</dt>
              <dd className="text-right font-bold">{formatDeparture(trip, { weekday: undefined })}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted">Countdown</dt>
              <dd className="font-bold">{ms > 0 ? countdown(ms) : 'Departed'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted">Checklist</dt>
              <dd className="font-bold tabular-nums">
                {trip.readiness.completed}/{trip.readiness.total}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </motion.article>
  )
}

export default function TripsDashboard() {
  const now = useNow(30000)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    api
      .dashboard()
      .then((d) => {
        if (!alive) return
        setData(d)
      })
      .catch((e) => alive && setError(e.message))
    return () => {
      alive = false
    }
  }, [])

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20">
        <Notice tone="error">{error}</Notice>
      </div>
    )
  }
  if (!data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted" role="status">
        <LoaderCircle className="size-8 animate-spin text-sky" /> Loading your trips…
      </div>
    )
  }

  const { trips, nextTrip, activity: allActivity, user } = data
  // Packing activity only (reward entries recorded by the server are not shown)
  const activity = allActivity.filter((a) => !/^(xp|achievement|levelup)$/.test(a.type))
  const greeting = user.displayName ? `Hi ${user.displayName}!` : 'Welcome, traveller!'

  // ── Empty state for new users ──
  if (!trips.length) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <section className="hero-surface overflow-hidden rounded-[2rem] px-6 py-12 text-navy sm:px-12">
          <div className="grid items-center gap-8 md:grid-cols-[auto_1fr]">
            <Mascot state="welcome" size={190} />
            <div>
              <p className="font-bold tracking-wide text-orange-700 uppercase">Did I forget something?</p>
              <h1 className="mt-2 text-4xl font-medium sm:text-5xl">Ready for your next adventure?</h1>
              <p className="mt-3 max-w-xl text-lg text-muted">
                Tell Orbi where you’re going and get a personalised checklist — documents, tickets, health, money and more.
              </p>
              <Link to="/trips/new" className={buttonClass('primary', 'lg', 'mt-7')}>
                <Plus className="size-5" /> Create your first trip
              </Link>
            </div>
          </div>
        </section>
      </div>
    )
  }

  const next = nextTrip ?? trips[trips.length - 1]
  const msNext = next.departureAt - now
  const unconfirmed = next.readiness.requirements.status === 'needs_confirmation' ? next.readiness.requirements.total - next.readiness.requirements.verified : 0
  const heroMessage =
    next.readiness.completionPct === 100
      ? unconfirmed
        ? `All packed! Confirm ${unconfirmed} entry requirement${unconfirmed === 1 ? '' : 's'} next.`
        : 'All checked! Your adventure awaits!'
      : next.readiness.completionPct >= 75
        ? 'You’re almost ready to take off!'
        : next.readiness.criticalOutstanding[0]
          ? `Your ${next.readiness.criticalOutstanding[0].title.toLowerCase().replace(/ —.*$/, '')} still needs a check!`
          : 'Let’s make sure you have everything!'
  const heroState = next.readiness.completionPct === 100 && !unconfirmed ? 'ready' : next.readiness.criticalOutstanding.length ? 'reminder' : 'idle'

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      {/* ── Hero ── */}
      <section className="hero-surface overflow-hidden rounded-[2rem] p-6 text-navy sm:p-10" aria-labelledby="dash-title">
        <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
          <div>
            <p className="font-bold text-orange-700">{greeting}</p>
            <h1 id="dash-title" className="mt-1 text-4xl font-medium sm:text-5xl">
              {nextTrip ? `Next stop: ${next.destinationCity}` : 'Your trips'}
            </h1>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-cream px-3 py-1.5 font-semibold">
                <CalendarClock className="size-4 text-orange-700" /> {formatDeparture(next)}
              </span>
              <span className="rounded-full bg-cream px-3 py-1.5 font-bold">{msNext > 0 ? `Departs in ${countdown(msNext)}` : 'Departed'}</span>
            </div>
            <div className="mt-6">
              <Mascot state={heroState} message={heroMessage} size={130} tone="light" />
            </div>
            <Link to={`/trips/${next.id}`} className={buttonClass('primary', 'lg', 'mt-7')}>
              {next.readiness.completionPct === 100 ? 'View checklist' : 'Continue packing'} <ArrowRight className="size-5" />
            </Link>
          </div>
          <div className="flex flex-col items-center gap-3 rounded-3xl bg-cream p-6 ring-1 ring-navy/10">
            <ReadinessRing score={next.readiness.score} size={170} label="Prepared" />
            <p className="text-muted">
              <strong className="text-navy tabular-nums">{next.readiness.completed}</strong> of {next.readiness.total} items checked
            </p>
          </div>
        </div>
      </section>

      {/* ── Progress ── */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl bg-white p-6 shadow-card ring-1 ring-navy/5" aria-labelledby="crit-title">
          <h2 id="crit-title" className="flex items-center gap-2 text-xl font-medium">
            <CircleAlert className="size-5 text-danger" /> Critical items left
          </h2>
          <p className="mt-1 text-sm text-muted">For {next.name || next.destinationCity}</p>
          {next.readiness.criticalOutstanding.length ? (
            <ul className="mt-3 space-y-2">
              {next.readiness.criticalOutstanding.map((c) => (
                <li key={c.id}>
                  <Link to={`/trips/${next.id}`} className="flex min-h-11 items-center gap-2 rounded-xl px-2 font-semibold hover:bg-cream">
                    <span className="size-2 shrink-0 rounded-full bg-danger" aria-hidden="true" /> {c.title}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-success-700">Every critical item is checked.</p>
          )}
          {unconfirmed > 0 && (
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-orange-50 p-3 text-sm text-navy">
              <ShieldQuestion className="mt-0.5 size-4 shrink-0 text-orange-700" /> {unconfirmed} entry requirement{unconfirmed === 1 ? '' : 's'} still to confirm with official sources.
            </p>
          )}
        </section>

        <section className="rounded-3xl bg-white p-6 shadow-card ring-1 ring-navy/5" aria-labelledby="act-title">
          <h2 id="act-title" className="flex items-center gap-2 text-xl font-medium">
            <Activity className="size-5 text-sky-600" /> Recent activity
          </h2>
          {activity.length ? (
            <ol className="mt-3 space-y-2.5">
              {activity.slice(0, 7).map((a) => (
                <li key={a.id} className="flex gap-3 text-sm">
                  <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', a.type === 'item' ? 'bg-orange' : 'bg-sky')} aria-hidden="true" />
                  <span className="flex-1">
                    {a.message}
                    <span className="block text-xs text-muted">{relTime(a.created_at)}</span>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-muted">Your packing activity will show up here.</p>
          )}
        </section>
      </div>

      {/* ── Trips ── */}
      <section className="mt-10" aria-labelledby="trips-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="trips-title" className="text-3xl font-medium">
            Your trips
          </h2>
          <Link to="/trips/new" className={buttonClass('dark', 'md')}>
            <Plus className="size-4" /> New trip
          </Link>
        </div>
        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {trips.map((t) => (
            <TripCard key={t.id} trip={t} now={now} />
          ))}
        </div>
      </section>

      {/* ── Achievements ── */}
    </div>
  )
}
