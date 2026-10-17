import { useEffect, useRef, useState } from 'react'
import { Smartphone } from 'lucide-react'
import Notice from '../ui/Notice'
import { disablePush, enablePush, pushStatus, syncPush } from '../../lib/push'
import { buttonClass } from '../../lib/ui'

const TEXT = {
  checking: 'Checking this device…',
  unsupported: 'This browser can’t show notifications. On iPhone, add ORBIT to your Home Screen first, then open it from there.',
  blocked: 'Notifications are blocked for this site. Allow them in your browser’s site settings, then reload.',
  off: 'Turn on notifications so reminders appear in this device’s notification bar.',
  on: 'Notifications are on for this device.',
}

/** Turns push notifications on/off for the current browser or phone. `onChange` runs after a change. */
export default function PushDeviceControl({ onChange }) {
  const [status, setStatus] = useState('checking')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })

  useEffect(() => {
    pushStatus().then(
      async (s) => {
        setStatus(s)
        // Already subscribed in this browser: make sure the server links it to the current session
        if (s === 'on' && (await syncPush().catch(() => false))) onChangeRef.current?.()
      },
      () => setStatus('unsupported'),
    )
  }, [])

  async function run(action, success, changes = true) {
    setBusy(true)
    setResult(null)
    try {
      await action()
      if (success) setResult({ tone: 'success', text: success })
      if (changes) onChange?.()
    } catch (err) {
      setResult({ tone: 'error', text: err.message })
    } finally {
      setStatus(await pushStatus().catch(() => 'off'))
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl bg-cream p-4">
      <h3 className="flex items-center gap-2 text-sm font-bold">
        <Smartphone className="size-4 text-orange-700" /> This device
      </h3>
      <p className="mt-1 text-sm text-muted">{TEXT[status]}</p>
      {(status === 'off' || status === 'on') && (
        <div className="mt-3 flex flex-wrap gap-2">
          {status === 'off' ? (
            <button type="button" disabled={busy} onClick={() => run(enablePush, 'Notifications are on for this device.')} className={buttonClass('dark', 'sm')}>
              {busy ? 'Turning on…' : 'Turn on notifications'}
            </button>
          ) : (
            <>
              <button type="button" disabled={busy} onClick={() => run(disablePush)} className={buttonClass('secondary', 'sm')}>
                Turn off
              </button>
            </>
          )}
        </div>
      )}
      {result && (
        <Notice tone={result.tone} className="mt-3">
          {result.text}
        </Notice>
      )}
    </div>
  )
}
