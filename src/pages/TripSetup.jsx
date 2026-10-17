import { useId, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, ArrowRight, BellRing, Check, Globe2, MapPin, Plane } from 'lucide-react'
import Mascot from '../components/mascot/Mascot'
import Notice from '../components/ui/Notice'
import PushDeviceControl from '../components/trips/PushDeviceControl'
import { COUNTRIES, POPULAR_DESTINATIONS, PURPOSES, TIME_ZONES, countryName, guessTimeZone, guessUserCountry } from '../data/trips'
import { api } from '../services/orbitApi'
import { buttonClass, cn } from '../lib/ui'

const STEPS = [
  { id: 'where', label: 'Route & Destination', icon: MapPin },
  { id: 'when', label: 'Date & purpose', icon: Plane },
  { id: 'remind', label: 'Reminders', icon: BellRing },
]
// Which step owns each server-side field (for routing validation errors back)
const FIELD_STEP = { departureCity: 0, departureCountry: 0, destinationCity: 0, destinationCountry: 0, name: 0, departureLocal: 1, departureTz: 1, purpose: 1 }

const inputCls =
  'h-12 w-full rounded-xl bg-white px-4 text-[15px] text-navy ring-1 ring-navy/15 placeholder:text-muted/80 focus:ring-2 focus:ring-sky focus:outline-none aria-invalid:ring-2 aria-invalid:ring-danger'

function Field({ label, hint, error, children, id, required }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-bold text-navy">
        {label} {required ? <span className="text-danger" aria-hidden="true">*</span> : <span className="font-semibold text-muted">(optional)</span>}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="mt-0.5 text-sm text-muted">
          {hint}
        </p>
      )}
      <div className="mt-2">{children}</div>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

const today = () => new Date().toISOString().slice(0, 10)

export default function TripSetup() {
  const navigate = useNavigate()
  const ids = {
    depCity: useId(),
    depCountry: useId(),
    city: useId(),
    country: useId(),
    name: useId(),
    date: useId(),
    time: useId(),
    tz: useId(),
  }
  const [step, setStep] = useState(0)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState(null)
  const [form, setForm] = useState({
    departureCity: '',
    departureCountry: guessUserCountry(),
    destinationCity: '',
    destinationCountry: '',
    name: '',
    date: '',
    time: '09:00',
    departureTz: guessTimeZone(),
    purpose: 'tourism',
    remindersEnabled: true,
    updatesEnabled: false,
  })
  const set = (patch) => {
    setForm((f) => ({ ...f, ...patch }))
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !(k in patch))))
  }

  function validateStep(i) {
    const e = {}
    if (i === 0) {
      if (!form.destinationCity.trim()) e.destinationCity = 'Enter the city you’re travelling to.'
      if (!form.destinationCountry) e.destinationCountry = 'Choose the destination country.'
    }
    if (i === 1) {
      if (!form.date) e.date = 'Choose your departure date.'
      if (!form.time) e.time = 'Choose your departure time.'
      if (form.date && form.time && new Date(`${form.date}T${form.time}`) < new Date(Date.now() - 3600000) && form.departureTz === guessTimeZone()) {
        e.date = 'Departure must be in the future.'
      }
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function next() {
    if (!validateStep(step)) return
    setStep((s) => Math.min(STEPS.length - 1, s + 1))
  }

  async function submit(e) {
    e.preventDefault()
    if (!validateStep(step)) return
    setSubmitting(true)
    setServerError(null)
    try {
      const res = await api.createTrip({
        name: form.name || null,
        departureCity: form.departureCity?.trim() || null,
        departureCountry: form.departureCountry || null,
        destinationCity: form.destinationCity.trim(),
        destinationCountry: form.destinationCountry,
        purpose: form.purpose,
        departureLocal: `${form.date}T${form.time}`,
        departureTz: form.departureTz,
        notifications: { remindersEnabled: form.remindersEnabled, updatesEnabled: form.updatesEnabled },
      })
      navigate(`/trips/${res.trip.id}`, { state: { welcome: true } })
    } catch (err) {
      setSubmitting(false)
      if (err.fields) {
        const mapped = Object.fromEntries(
          Object.entries(err.fields).map(([k, v]) => [k === 'departureLocal' ? 'date' : k, v]),
        )
        setErrors(mapped)
        const first = Math.min(...Object.keys(err.fields).map((k) => FIELD_STEP[k] ?? step))
        setStep(first)
      } else setServerError(err.message)
    }
  }

  const matches = useMemo(() => {
    const q = form.destinationCity.trim().toLowerCase()
    if (q.length < 1) return POPULAR_DESTINATIONS.slice(0, 6)
    return POPULAR_DESTINATIONS.filter((d) => d.city.toLowerCase().startsWith(q)).slice(0, 6)
  }, [form.destinationCity])

  if (submitting) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-4 text-center" role="status">
        <Mascot state="thinking" size={180} />
        <h1 className="mt-6 text-3xl font-medium">Packing your personalised checklist…</h1>
        <p className="mt-2 text-muted">
          Looking at {form.destinationCity}, {countryName(form.destinationCountry)} for a {form.purpose} trip. This can take a few seconds.
        </p>
      </div>
    )
  }

  const progress = ((step + 1) / STEPS.length) * 100

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <Link to="/trips" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-sky-600 hover:underline">
        <ArrowLeft className="size-4" /> Your trips
      </Link>

      <div className="mt-2 grid gap-8 lg:grid-cols-[1fr_300px]">
        <div>
          <p className="text-sm font-bold text-orange-700">Did I forget something?</p>
          <h1 className="mt-1 text-4xl font-medium sm:text-5xl">Plan a new trip</h1>

          {/* Step indicator */}
          <nav aria-label="Trip setup progress" className="mt-6">
            <p className="text-sm font-bold text-muted">
              Step {step + 1} of {STEPS.length}: <span className="text-navy">{STEPS[step].label}</span>
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-cream-200" aria-hidden="true">
              <motion.div className="h-full rounded-full bg-linear-to-r from-sky to-mint" animate={{ width: `${progress}%` }} transition={{ duration: 0.4 }} />
            </div>
            <ol className="mt-3 hidden gap-2 sm:flex">
              {STEPS.map((s, i) => (
                <li key={s.id} className="flex-1">
                  <button
                    type="button"
                    onClick={() => i < step && setStep(i)}
                    disabled={i >= step}
                    aria-current={i === step ? 'step' : undefined}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-bold transition-colors disabled:cursor-default',
                      i === step ? 'bg-navy text-white' : i < step ? 'cursor-pointer bg-mint-50 text-mint-700 hover:bg-mint/20' : 'bg-white text-muted ring-1 ring-navy/8',
                    )}
                  >
                    {i < step ? <Check className="size-4" /> : <s.icon className="size-4" />}
                    {s.label}
                  </button>
                </li>
              ))}
            </ol>
          </nav>

          <form onSubmit={submit} noValidate className="mt-6 rounded-3xl bg-white p-6 shadow-card ring-1 ring-navy/5 sm:p-8">
            <AnimatePresence mode="wait">
              <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.2 }} className="space-y-6">
                {step === 0 && (
                  <>
                    <div className="rounded-2xl bg-cream-50 p-4 ring-1 ring-navy/10 space-y-4">
                      <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-muted">
                        <MapPin className="size-3.5 text-sky-600" /> Departure Place (Origin)
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field id={ids.depCity} label="Departing from (city)">
                          <input
                            id={ids.depCity}
                            list={`${ids.depCity}-list`}
                            value={form.departureCity}
                            onChange={(e) => {
                              const match = POPULAR_DESTINATIONS.find((d) => d.city.toLowerCase() === e.target.value.toLowerCase())
                              set({ departureCity: e.target.value, ...(match ? { departureCountry: match.country } : {}) })
                            }}
                            placeholder="e.g. Kozhikode or Mumbai"
                            autoComplete="off"
                            maxLength={80}
                            className={inputCls}
                          />
                          <datalist id={`${ids.depCity}-list`}>
                            {POPULAR_DESTINATIONS.map((d) => (
                              <option key={`dep-${d.city}`} value={d.city}>
                                {countryName(d.country)}
                              </option>
                            ))}
                          </datalist>
                        </Field>

                        <Field id={ids.depCountry} label="Departure country">
                          <select
                            id={ids.depCountry}
                            value={form.departureCountry}
                            onChange={(e) => set({ departureCountry: e.target.value })}
                            className={cn(inputCls, 'cursor-pointer')}
                          >
                            <option value="">Choose departure country…</option>
                            {COUNTRIES.map((c) => (
                              <option key={`dep-c-${c.code}`} value={c.code}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </Field>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-cream-50 p-4 ring-1 ring-navy/10 space-y-4">
                      <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-muted">
                        <Plane className="size-3.5 text-orange-600" /> Arrival Place (Destination)
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field id={ids.city} label="Destination city" required error={errors.destinationCity}>
                          <input
                            id={ids.city}
                            list={`${ids.city}-list`}
                            value={form.destinationCity}
                            onChange={(e) => {
                              const match = POPULAR_DESTINATIONS.find((d) => d.city.toLowerCase() === e.target.value.toLowerCase())
                              set({ destinationCity: e.target.value, ...(match && !form.destinationCountry ? { destinationCountry: match.country } : {}) })
                            }}
                            placeholder="e.g. Dubai or Mumbai"
                            autoComplete="off"
                            maxLength={80}
                            aria-invalid={Boolean(errors.destinationCity)}
                            aria-describedby={errors.destinationCity ? `${ids.city}-error` : undefined}
                            aria-required="true"
                            className={inputCls}
                            autoFocus
                          />
                          <datalist id={`${ids.city}-list`}>
                            {POPULAR_DESTINATIONS.map((d) => (
                              <option key={d.city} value={d.city}>
                                {countryName(d.country)}
                              </option>
                            ))}
                          </datalist>
                        </Field>

                        <Field id={ids.country} label="Destination country" required error={errors.destinationCountry}>
                          <select
                            id={ids.country}
                            value={form.destinationCountry}
                            onChange={(e) => set({ destinationCountry: e.target.value })}
                            aria-invalid={Boolean(errors.destinationCountry)}
                            aria-describedby={errors.destinationCountry ? `${ids.country}-error` : undefined}
                            aria-required="true"
                            className={cn(inputCls, 'cursor-pointer')}
                          >
                            <option value="">Choose a country…</option>
                            {COUNTRIES.map((c) => (
                              <option key={c.code} value={c.code}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </Field>
                      </div>

                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {matches.map((d) => (
                          <button
                            key={d.city}
                            type="button"
                            onClick={() => set({ destinationCity: d.city, destinationCountry: d.country })}
                            className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-full bg-white px-3 text-sm font-semibold text-navy ring-1 ring-navy/10 hover:ring-sky sm:min-h-9"
                          >
                            <MapPin className="size-3.5 text-sky-600" /> {d.city}
                          </button>
                        ))}
                      </div>
                    </div>

                    {form.destinationCountry && form.departureCountry && (
                      <div
                        className={cn(
                          'flex items-center gap-3 rounded-2xl p-4 text-sm font-medium transition-colors',
                          form.departureCountry === form.destinationCountry
                            ? 'bg-mint-50/80 text-mint-900 ring-1 ring-mint-300'
                            : 'bg-sky-50/80 text-sky-900 ring-1 ring-sky-200',
                        )}
                      >
                        <div className="text-2xl">
                          {form.departureCountry === form.destinationCountry ? '🛡️' : '🌍'}
                        </div>
                        <div>
                          <div className="font-bold flex items-center gap-2">
                            <span>{form.departureCountry === form.destinationCountry ? 'Domestic trip detected' : 'International trip detected'}</span>
                            <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', form.departureCountry === form.destinationCountry ? 'bg-mint-200/80 text-mint-800' : 'bg-sky-200/80 text-sky-800')}>
                              {form.departureCountry === form.destinationCountry ? 'No passport / visa needed' : 'Passport & entry checks required'}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs opacity-90">
                            {form.departureCountry === form.destinationCountry
                              ? 'Travelling within the same country: Checklist will ask for government-issued photo ID (driver’s license, Aadhaar, etc.). Passports and visas are excluded.'
                              : 'Travelling cross-border: Checklist will include 6-month passport validity checks and official visa entry requirements.'}
                          </p>
                        </div>
                      </div>
                    )}

                    <Field id={ids.name} label="Trip name" hint="Shown on your dashboard, e.g. “Sara’s wedding in Dubai”.">
                      <input id={ids.name} value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={60} placeholder="Give your trip a name" className={inputCls} />
                    </Field>
                  </>
                )}

                {step === 1 && (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field id={ids.date} label="Departure date" required error={errors.date}>
                        <input
                          id={ids.date}
                          type="date"
                          min={today()}
                          value={form.date}
                          onChange={(e) => set({ date: e.target.value })}
                          aria-invalid={Boolean(errors.date)}
                          aria-describedby={errors.date ? `${ids.date}-error` : undefined}
                          aria-required="true"
                          className={inputCls}
                          autoFocus
                        />
                      </Field>
                      <Field id={ids.time} label="Departure time" required error={errors.time}>
                        <input id={ids.time} type="time" value={form.time} onChange={(e) => set({ time: e.target.value })} aria-required="true" className={inputCls} />
                      </Field>
                    </div>
                    <Field id={ids.tz} label="Time zone of departure" required hint="Reminders are scheduled using this time zone.">
                      <select id={ids.tz} value={form.departureTz} onChange={(e) => set({ departureTz: e.target.value })} className={cn(inputCls, 'cursor-pointer')}>
                        {TIME_ZONES.map((tz) => (
                          <option key={tz} value={tz}>
                            {tz.replace(/_/g, ' ')}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <fieldset>
                      <legend className="text-sm font-bold text-navy">
                        Trip purpose <span className="text-danger" aria-hidden="true">*</span>
                      </legend>
                      <div role="radiogroup" aria-label="Trip purpose" className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {PURPOSES.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            role="radio"
                            aria-checked={form.purpose === p.id}
                            onClick={() => set({ purpose: p.id })}
                            className={cn(
                              'flex min-h-12 cursor-pointer items-center gap-2 rounded-xl px-3 text-[15px] font-bold ring-1 transition-colors',
                              form.purpose === p.id ? 'bg-navy text-white ring-navy' : 'bg-white text-navy ring-navy/15 hover:ring-sky',
                            )}
                          >
                            <p.icon className={cn('size-4', form.purpose === p.id ? 'text-orange' : 'text-sky-600')} /> {p.label}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  </>
                )}

                {step === 2 && (
                  <>
                    <div className="flex items-start gap-3 rounded-2xl bg-cream p-4">
                      <BellRing className="mt-0.5 size-5 shrink-0 text-orange-700" />
                      <div className="text-sm leading-relaxed text-navy">
                        <p className="font-bold">Trip reminders (optional)</p>
                        <p className="text-muted">Get a notification on your phone before you leave, with your checklist progress. Item names are never shown on your lock screen.</p>
                      </div>
                    </div>
                    <fieldset className="space-y-2">
                      <legend className="sr-only">Notifications for this trip</legend>
                      {[
                        ['remindersEnabled', 'Remind me 24 hours and 3 hours before departure'],
                        ['updatesEnabled', 'A short update when I check items (batched, at most one every 2 minutes)'],
                      ].map(([key, text]) => (
                        <label key={key} className="flex min-h-11 cursor-pointer items-center gap-3">
                          <input type="checkbox" checked={form[key]} onChange={(e) => set({ [key]: e.target.checked })} className="size-5 shrink-0 cursor-pointer accent-navy" />
                          <span className="text-[15px]">{text}</span>
                        </label>
                      ))}
                    </fieldset>
                    {(form.remindersEnabled || form.updatesEnabled) && <PushDeviceControl />}
                  </>
                )}
              </motion.div>
            </AnimatePresence>

            {serverError && (
              <Notice tone="error" className="mt-6">
                {serverError}
              </Notice>
            )}

            <div className="mt-8 flex flex-col-reverse gap-3 border-t border-navy/8 pt-6 sm:flex-row sm:justify-between">
              {step > 0 ? (
                <button type="button" onClick={() => setStep(step - 1)} className={buttonClass('secondary', 'lg')}>
                  <ArrowLeft className="size-5" /> Back
                </button>
              ) : (
                <span />
              )}
              {step < STEPS.length - 1 ? (
                <button type="button" onClick={next} className={buttonClass('dark', 'lg')}>
                  Continue <ArrowRight className="size-5" />
                </button>
              ) : (
                <button type="submit" className={buttonClass('primary', 'lg')}>
                  Create my checklist <ArrowRight className="size-5" />
                </button>
              )}
            </div>
          </form>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-24 rounded-3xl hero-surface p-6 text-navy">
            <Mascot state={step === 0 ? 'welcome' : 'idle'} size={150} />
            <p className="mt-4 font-display text-xl font-semibold">
              {step === 0 && 'Ready for your next adventure?'}
              {step === 1 && 'When do we take off?'}
              {step === 2 && 'Want me to nudge you before you leave?'}
            </p>
            {form.destinationCity && (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-cream px-3 py-1 text-sm font-semibold">
                <Globe2 className="size-4 text-orange-700" /> {form.destinationCity}
                {form.destinationCountry && `, ${countryName(form.destinationCountry)}`}
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
