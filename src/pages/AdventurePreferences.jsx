import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { motion } from 'motion/react'
import { ArrowRight, CalendarClock, Heart, MapPin, RotateCcw, ShieldCheck, Smile, Wallet } from 'lucide-react'
import {
  BudgetPicker,
  BufferPicker,
  DeadlineField,
  InterestPicker,
  MoodPicker,
  LocationField,
} from '../components/adventure/PreferenceControls'
import Notice from '../components/ui/Notice'
import { useOrbitStore } from '../store/useOrbitStore'
import { MOOD_MAP } from '../data/options'
import { useNow } from '../hooks/useNow'
import { computeWindow, getBudget, resolveStart, validateBudget } from '../lib/planner'
import { searchLocal } from '../services/locationService'
import { formatClock, formatINR, formatMinutes } from '../lib/format'
import PageHero from '../components/ui/PageHero'
import { buttonClass, cn } from '../lib/ui'

function Section({ id, letter, icon: Icon, title, hint, children, optional }) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="scroll-mt-24 rounded-3xl bg-white p-6 shadow-card ring-1 ring-navy/5 sm:p-7"
      aria-labelledby={`${id}-title`}
    >
      <div className="flex items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-cream text-navy ring-1 ring-navy/5">
          <Icon className="size-5 text-sky" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-wider text-muted uppercase">
            Step {letter}
            {optional && <span className="ml-2 rounded-full bg-cream px-2 py-0.5 normal-case tracking-normal">Optional</span>}
          </p>
          <h2 id={`${id}-title`} className="mt-0.5 text-xl font-medium sm:text-2xl">
            {title}
          </h2>
          {hint && <p className="mt-1 text-[15px] leading-relaxed text-muted">{hint}</p>}
        </div>
      </div>
      <div className="mt-5 sm:pl-15">{children}</div>
    </motion.section>
  )
}

export default function AdventurePreferences() {
  const navigate = useNavigate()
  const prefs = useOrbitStore((s) => s.preferences)
  const updatePreferences = useOrbitStore((s) => s.updatePreferences)
  const markSearched = useOrbitStore((s) => s.markSearched)
  const resetPreferences = useOrbitStore((s) => s.resetPreferences)
  const [submitted, setSubmitted] = useState(false)
  const now = useNow(30000)

  // Default return time to 60 minutes from now if unset so remaining time is calculated immediately
  useEffect(() => {
    if (!prefs.deadline) {
      const d = new Date(Date.now() + 60 * 60000)
      const hh = String(d.getHours()).padStart(2, '0')
      const mm = String(d.getMinutes()).padStart(2, '0')
      updatePreferences({ deadline: `${hh}:${mm}` })
    }
  }, [prefs.deadline, updatePreferences])

  const win = useMemo(() => computeWindow(prefs, new Date(now)), [prefs, now])
  const budget = getBudget(prefs)
  const windowError = (field) => win.errors.find((e) => e.field === field)?.text ?? null

  function validate() {
    return {
      deadline: !prefs.deadline ? 'Choose the time you need to be back.' : (windowError('deadline') || windowError('window')),
      budget: validateBudget(prefs),
      location: prefs.location?.label?.trim() || prefs.location?.coords ? null : 'Enter a starting location or use your current location.',
      window: windowError('window'),
    }
  }

  // Validate live once the user has tried to submit
  const shownErrors = submitted ? validate() : {}

  function submit(e) {
    e.preventDefault()
    const next = validate()
    setSubmitted(true)
    const first = Object.entries(next).find(([, v]) => v)
    if (first) {
      const target = { deadline: 'deadline', budget: 'budget', location: 'location', window: 'buffer' }[first[0]]
      const section = document.getElementById(target)
      section?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      // Move keyboard focus to the first invalid field once its error has rendered
      requestAnimationFrame(() =>
        (section?.querySelector('[aria-invalid="true"]') ?? section?.querySelector('input, button'))?.focus({ preventScroll: true }),
      )
      return
    }
    if (!prefs.location.coords && prefs.location.label) {
      const resolved = resolveStart(prefs.location)
      let coords = resolved?.coords
      if (!coords) {
        const match = searchLocal(prefs.location.label)[0]
        if (match?.coords) coords = match.coords
      }
      if (coords) {
        updatePreferences({ location: { ...prefs.location, coords, source: 'manual' } })
      }
    }
    markSearched()
    navigate('/adventure/results')
  }

  const hasBlockingError = submitted && Object.values(shownErrors).some(Boolean)

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <PageHero
        eyebrow="Find an adventure"
        title="Let’s plan your spare time"
        description="Tell us about your window and we’ll find adventures that get you back on time."
        mascot={{ state: 'welcome', message: 'Got time to spare? Let’s make it count!' }}
      />

      <form onSubmit={submit} noValidate className="mt-10 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <Section
            id="deadline"
            letter="A"
            icon={CalendarClock}
            title="When do you need to be back?"
            hint="Add your departure or check-in time and we’ll make sure your plan ends before it."
          >
            <DeadlineField error={shownErrors.deadline} />
            {prefs.deadline && !shownErrors.deadline && (
              <div className="mt-3 space-y-2">
                {win.notices.filter((n) => n.field === 'deadline').map((n) => (
                  <Notice key={n.text} tone={n.tone}>
                    {n.text}
                  </Notice>
                ))}
              </div>
            )}
          </Section>

          <Section id="budget" letter="B" icon={Wallet} title="What’s your budget?" hint="Includes entry, food and any auto/taxi fare there and back.">
            <BudgetPicker error={shownErrors.budget} />
          </Section>

          <Section
            id="mood"
            letter="C"
            icon={Smile}
            title="How are you feeling?"
            hint="Pick your travel mood. It reorders adventures that already fit your time and budget — it never breaks those limits."
            optional
          >
            <MoodPicker showBlurb />
          </Section>

          <Section
            id="interests"
            letter="D"
            icon={Heart}
            title="What are you in the mood for?"
            hint="Pick as many as you like — or none, and we’ll suggest a mix."
            optional
          >
            <InterestPicker />
          </Section>

          <Section id="location" letter="E" icon={MapPin} title="Where are you starting from?" hint="Type a station or landmark, or use your current location.">
            <LocationField error={shownErrors.location} />
          </Section>

          <Section
            id="buffer"
            letter="F"
            icon={ShieldCheck}
            title="Safety buffer"
            hint="Time we keep in reserve for getting back to your starting point and handling small delays — queues, crowds or a slow lift."
          >
            <BufferPicker />
            {win.notices.filter((n) => n.field === 'buffer').map((n) => (
              <Notice key={n.text} tone={n.tone} className="mt-4">
                {n.text}
              </Notice>
            ))}
            {shownErrors.window && (
              <Notice tone="error" className="mt-4">
                {shownErrors.window}
              </Notice>
            )}
          </Section>
        </div>

        {/* Live summary */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="overflow-hidden rounded-3xl bg-navy text-white shadow-lift">
            <div className="p-6">
              <p className="text-sm font-semibold text-orange">Your adventure window</p>
              <p className="mt-2 font-display text-5xl font-medium tabular-nums">
                {win.errors.length && !Number.isFinite(win.usableMinutes) ? '—' : formatMinutes(Math.max(0, win.usableMinutes))}
              </p>
              <p className="mt-1 text-sm text-cream/70">for travel and exploring</p>

              <dl className="mt-6 space-y-3 border-t border-white/10 pt-5 text-sm">
                <Row label="Remaining time" value={Number.isFinite(win.windowMinutes) && win.windowMinutes > 0 ? formatMinutes(win.windowMinutes) : '—'} />
                <Row label="Safety buffer" value={`− ${win.buffer} min`} />
                <Row label="Budget" value={Number.isFinite(budget) ? (budget === 0 ? 'Free only' : `Up to ${formatINR(budget)}`) : '—'} />
                <Row label="Mood" value={moodSummary(prefs.moods)} />
                <Row label="Interests" value={prefs.interests.length ? `${prefs.interests.length} selected` : 'Surprise me'} />
                {win.deadlineAt && <Row label="Be back by" value={formatClock(win.deadlineAt)} />}
              </dl>
            </div>
            <div className="bg-navy-800 p-6">
              <button type="submit" className={buttonClass('primary', 'lg', 'w-full')}>
                Find My Adventures <ArrowRight className="size-5" />
              </button>
              {hasBlockingError && <p className="mt-3 text-center text-sm text-orange">Please fix the highlighted fields.</p>}
              <button
                type="button"
                onClick={() => {
                  resetPreferences()
                  setSubmitted(false)
                }}
                className="mt-1 inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-1.5 text-sm font-medium text-cream/60 hover:text-cream"
              >
                <RotateCcw className="size-3.5" /> Reset preferences
              </button>
            </div>
          </div>
        </aside>
      </form>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className={cn('flex items-center justify-between gap-4')}>
      <dt className="text-cream/65">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  )
}

function moodSummary(moods = []) {
  if (!moods.length) return 'Any'
  const first = MOOD_MAP[moods[0]]?.label
  return moods.length === 1 ? first : `${first} +${moods.length - 1}`
}
