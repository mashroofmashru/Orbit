import { Link } from 'react-router'
import { useId, useMemo } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Clock, LoaderCircle, LocateFixed, MapPin, ShieldCheck, X } from 'lucide-react'
import Chip from '../ui/Chip'
import Notice from '../ui/Notice'
import { BUDGET_OPTIONS, BUFFER_OPTIONS, DURATION_OPTIONS, INTERESTS, LIMITS, MOODS } from '../../data/options'
import { HUBS } from '../../data/adventures'
import { minutesUntil, resolveStart } from '../../lib/planner'
import { formatClock, formatMinutes } from '../../lib/format'
import { describeCurrentLocation, searchLocal } from '../../services/locationService'
import { useGeolocation } from '../../hooks/useGeolocation'
import { useNow } from '../../hooks/useNow'
import { useOrbitStore } from '../../store/useOrbitStore'
import { cn } from '../../lib/ui'

const inputCls =
  'h-12 w-full rounded-xl bg-white px-4 text-[15px] text-navy ring-1 ring-navy/12 placeholder:text-muted/70 transition focus:ring-2 focus:ring-sky focus:outline-none aria-invalid:ring-danger'

function FieldError({ id, children }) {
  return (
    <AnimatePresence>
      {children && (
        <motion.p
          id={id}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="mt-2 text-sm font-medium text-danger"
          role="alert"
        >
          {children}
        </motion.p>
      )}
    </AnimatePresence>
  )
}

export function DurationPicker({ error, size }) {
  const prefs = useOrbitStore((s) => s.preferences)
  const update = useOrbitStore((s) => s.updatePreferences)
  const errId = useId()
  return (
    <div>
      <div role="radiogroup" aria-label="Available time" className="flex flex-wrap gap-2">
        {DURATION_OPTIONS.map((m) => (
          <Chip key={m} size={size} selected={prefs.durationOption === m} onClick={() => update({ durationOption: m })}>
            {m} min
          </Chip>
        ))}
        <Chip size={size} selected={prefs.durationOption === 'custom'} onClick={() => update({ durationOption: 'custom' })}>
          Custom
        </Chip>
      </div>
      <AnimatePresence initial={false}>
        {prefs.durationOption === 'custom' && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <label className="mt-3 block max-w-xs">
              <span className="sr-only">Custom duration in minutes</span>
              <div className="relative">
                <input
                  type="number"
                  inputMode="numeric"
                  min={LIMITS.minDuration}
                  max={LIMITS.maxDuration}
                  step={1}
                  value={prefs.customDuration}
                  onChange={(e) => update({ customDuration: e.target.value.replace(/[^\d]/g, '') })}
                  onKeyDown={(e) => ['-', '+', 'e', 'E', '.'].includes(e.key) && e.preventDefault()}
                  placeholder="e.g. 90"
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? errId : undefined}
                  className={cn(inputCls, 'pr-20')}
                  autoFocus
                />
                <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-muted">minutes</span>
              </div>
            </label>
          </motion.div>
        )}
      </AnimatePresence>
      <FieldError id={errId}>{error}</FieldError>
    </div>
  )
}

export function BudgetPicker({ error, size }) {
  const prefs = useOrbitStore((s) => s.preferences)
  const update = useOrbitStore((s) => s.updatePreferences)
  const errId = useId()
  return (
    <div>
      <div role="radiogroup" aria-label="Budget" className="flex flex-wrap gap-2">
        {BUDGET_OPTIONS.map((b) => (
          <Chip key={b.id} size={size} selected={prefs.budgetOption === b.id} onClick={() => update({ budgetOption: b.id })}>
            {b.label}
          </Chip>
        ))}
        <Chip size={size} selected={prefs.budgetOption === 'custom'} onClick={() => update({ budgetOption: 'custom' })}>
          Custom
        </Chip>
      </div>
      <AnimatePresence initial={false}>
        {prefs.budgetOption === 'custom' && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <label className="mt-3 block max-w-xs">
              <span className="sr-only">Custom budget in rupees</span>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center font-semibold text-muted">₹</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={10}
                  value={prefs.customBudget}
                  onChange={(e) => update({ customBudget: e.target.value.replace(/[^\d]/g, '') })}
                  onKeyDown={(e) => ['-', '+', 'e', 'E'].includes(e.key) && e.preventDefault()}
                  placeholder="e.g. 250"
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? errId : undefined}
                  className={cn(inputCls, 'pl-9')}
                  autoFocus
                />
              </div>
            </label>
          </motion.div>
        )}
      </AnimatePresence>
      <FieldError id={errId}>{error}</FieldError>
    </div>
  )
}

export function InterestPicker({ size }) {
  const interests = useOrbitStore((s) => s.preferences.interests)
  const toggle = useOrbitStore((s) => s.toggleInterest)
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Interests">
      {INTERESTS.map((i) => (
        <Chip key={i.id} multi size={size} icon={i.icon} selected={interests.includes(i.id)} onClick={() => toggle(i.id)}>
          {i.label}
        </Chip>
      ))}
    </div>
  )
}

export function MoodPicker({ size, showBlurb = false }) {
  const moods = useOrbitStore((s) => s.preferences.moods ?? [])
  const toggle = useOrbitStore((s) => s.toggleMood)
  if (showBlurb) {
    return (
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" role="group" aria-label="Travel mood">
        {MOODS.map((m) => {
          const on = moods.includes(m.id)
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(m.id)}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-2xl p-3.5 text-left ring-1 transition-all',
                on ? 'bg-navy text-white ring-navy shadow-[0_6px_16px_-8px_rgb(16_36_58/0.7)]' : 'bg-white text-navy ring-navy/12 hover:ring-sky',
              )}
            >
              <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', on ? 'bg-orange text-white' : 'bg-orange-50 text-orange-700')}>
                <m.icon className="size-[18px]" />
              </span>
              <span>
                <span className="block font-semibold">{m.label}</span>
                <span className={cn('block text-xs', on ? 'text-white/70' : 'text-muted')}>{m.blurb}</span>
              </span>
            </button>
          )
        })}
      </div>
    )
  }
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Travel mood">
      {MOODS.map((m) => (
        <Chip key={m.id} multi size={size} icon={m.icon} selected={moods.includes(m.id)} onClick={() => toggle(m.id)}>
          {m.label}
        </Chip>
      ))}
    </div>
  )
}

export function LocationField({ compact = false, error }) {
  const location = useOrbitStore((s) => s.preferences.location)
  const update = useOrbitStore((s) => s.updatePreferences)
  const geo = useGeolocation()
  const inputId = useId()
  const errId = useId()

  async function useCurrentLocation() {
    const coords = await geo.request()
    if (!coords) return
    const { label } = describeCurrentLocation(coords)
    update({ location: { label, coords, source: 'geo' } })
  }

  function onType(value) {
    const resolved = resolveStart({ label: value })
    let coords = resolved.coords
    if (!coords && value.trim().length >= 3) {
      const match = searchLocal(value)[0]
      if (match?.coords) coords = match.coords
    }
    update({ location: { label: value, coords: coords ?? null, source: coords ? 'manual' : 'text' } })
  }

  const usingGeo = location.source === 'geo' && location.coords
  const geoTone = { granted: 'success', denied: 'error', unavailable: 'warning', timeout: 'warning', unsupported: 'warning' }[geo.status]

  return (
    <div>
      <label htmlFor={inputId} className="sr-only">
        Starting location
      </label>
      <div className={cn('flex gap-2', compact ? 'flex-col' : 'flex-col sm:flex-row')}>
        <div className="relative flex-1">
          <MapPin className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-sky" />
          <input
            id={inputId}
            type="text"
            value={location.label}
            onChange={(e) => onType(e.target.value)}
            placeholder="e.g. Eiffel Tower, Paris or Times Square, NY or Connaught Place, Delhi"
            autoComplete="off"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errId : undefined}
            className={cn(inputCls, 'pr-10 pl-11', usingGeo && 'bg-sky-50 font-medium')}
          />
          {location.label && (
            <button
              type="button"
              onClick={() => {
                onType('')
                geo.reset()
              }}
              className="absolute top-1/2 right-0.5 grid size-11 -translate-y-1/2 cursor-pointer place-items-center rounded-full text-muted hover:bg-navy/5 hover:text-navy"
              aria-label="Clear location"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={useCurrentLocation}
          disabled={geo.status === 'requesting'}
          className="inline-flex h-12 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl bg-sky-50 px-4 text-[15px] font-semibold text-sky-600 ring-1 ring-sky/25 transition hover:bg-sky hover:text-white disabled:opacity-60"
        >
          {geo.status === 'requesting' ? <LoaderCircle className="size-4 animate-spin" /> : <LocateFixed className="size-4" />}
          {geo.status === 'requesting' ? 'Locating…' : 'Use My Current Location'}
        </button>
      </div>
      <FieldError id={errId}>{error}</FieldError>

      {geo.message && geo.status !== 'requesting' && geoTone && (
        <Notice tone={geoTone} className="mt-3">
          {geo.message}
        </Notice>
      )}

      {!compact && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <Link to="/adventure/discover" className="inline-flex min-h-11 items-center gap-1 font-bold text-sky-600 hover:underline sm:min-h-0">
              Discover places around you →
            </Link>
            <span className="text-muted">Popular spots:</span>
            {HUBS.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => onType(h.name)}
                className="inline-flex min-h-11 cursor-pointer items-center rounded-full bg-cream-200/70 px-3 py-1 font-medium sm:min-h-8 text-navy transition hover:bg-orange-50 hover:text-orange-700"
              >
                {h.city || h.name}
              </button>
            ))}
          </div>
          <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted">
            <ShieldCheck className="mt-px size-4 shrink-0 text-success-700" />
            Location is only requested when you tap the button. Adventure planning coordinates are never stored on an ORBIT server.
            Map tiles and nearby place data load securely from OpenStreetMap.
          </p>
        </>
      )}
    </div>
  )
}

export function DeadlineField({ error }) {
  const deadline = useOrbitStore((s) => s.preferences.deadline)
  const update = useOrbitStore((s) => s.updatePreferences)
  const id = useId()
  const errId = useId()
  const now = useNow(30000)

  const setOffset = (mins) => {
    const target = new Date(now + mins * 60000)
    const hh = String(target.getHours()).padStart(2, '0')
    const mm = String(target.getMinutes()).padStart(2, '0')
    update({ deadline: `${hh}:${mm}` })
  }

  const remaining = useMemo(() => {
    if (!deadline) return null
    return minutesUntil(deadline, new Date(now))
  }, [deadline, now])

  const PRESETS = [
    { label: '+30 min', mins: 30 },
    { label: '+45 min', mins: 45 },
    { label: '+1 hour', mins: 60 },
    { label: '+2 hours', mins: 120 },
    { label: '+3 hours', mins: 180 },
    { label: '+4 hours', mins: 240 },
  ]

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold tracking-wider text-muted uppercase">Quick presets from now:</span>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.mins}
              type="button"
              onClick={() => setOffset(p.mins)}
              className="cursor-pointer rounded-full bg-cream-200/70 px-3 py-1 text-xs font-semibold text-navy/80 ring-1 ring-navy/10 transition hover:bg-sky hover:text-white"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex max-w-sm gap-2">
        <div className="relative flex-1">
          <label htmlFor={id} className="sr-only">
            Return-by time
          </label>
          <input
            id={id}
            type="time"
            value={deadline}
            onChange={(e) => update({ deadline: e.target.value })}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errId : undefined}
            className={cn(inputCls, 'w-full')}
          />
        </div>
        {deadline && (
          <button
            type="button"
            onClick={() => update({ deadline: '' })}
            className="h-12 cursor-pointer rounded-xl px-4 text-sm font-semibold text-muted ring-1 ring-navy/12 transition hover:text-navy"
          >
            Clear
          </button>
        )}
      </div>

      {remaining && !remaining.rolled && (
        <div className="mt-3 inline-flex items-center gap-2 rounded-xl bg-sky-50 px-3.5 py-2 text-sm text-sky-900 ring-1 ring-sky/20">
          <Clock className="size-4 shrink-0 text-sky-600" />
          <span>
            Remaining free time: <strong className="font-bold">{formatMinutes(remaining.minutes)}</strong> until{' '}
            <strong className="font-bold">{formatClock(remaining.target)}</strong>
          </span>
        </div>
      )}

      {remaining && remaining.rolled && remaining.minutes <= 12 * 60 && (
        <div className="mt-3 inline-flex items-center gap-2 rounded-xl bg-amber-50 px-3.5 py-2 text-sm text-amber-900 ring-1 ring-amber/20">
          <Clock className="size-4 shrink-0 text-amber-600" />
          <span>
            Return time tomorrow: <strong className="font-bold">{formatMinutes(remaining.minutes)}</strong> from now ({formatClock(remaining.target)})
          </span>
        </div>
      )}

      <FieldError id={errId}>{error}</FieldError>
    </div>
  )
}

export function BufferPicker() {
  const buffer = useOrbitStore((s) => s.preferences.buffer)
  const update = useOrbitStore((s) => s.updatePreferences)
  return (
    <div role="radiogroup" aria-label="Safety buffer" className="flex flex-wrap gap-2">
      {BUFFER_OPTIONS.map((b) => (
        <Chip key={b} selected={buffer === b} onClick={() => update({ buffer: b })}>
          {b} min{b === 10 && <span className={cn('text-xs font-medium', buffer === b ? 'text-white/70' : 'text-muted')}>· recommended</span>}
        </Chip>
      ))}
    </div>
  )
}
