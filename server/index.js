import dns from 'node:dns'
import { createApp } from './app.js'
import { loadConfig } from './config.js'

dns.setDefaultResultOrder?.('ipv4first')

const config = loadConfig()
const { app, notifications, db } = createApp(config)

notifications.start()
const server = app.listen(config.port, () => {
  console.log(`[orbit] API listening on http://localhost:${config.port}`)
  console.log(`[orbit] Push notifications: ${config.push.publicKey && config.push.privateKey && config.push.subject ? 'on' : 'off — set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (and VAPID_SUBJECT)'}`)
  console.log(`[orbit] AI checklist: ${config.ai.enabled && config.ai.hasCredentials ? config.ai.model : 'off — rule-based checklists only'}`)
})

function shutdown() {
  notifications.stop()
  server.close(() => {
    db.close()
    process.exit(0)
  })
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
