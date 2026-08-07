import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = process.env.SHABBOS_DATA_DIR || path.join(__dirname, 'data')
fs.mkdirSync(dataDir, { recursive: true })

const dbPath = path.join(dataDir, 'shabbos.json')

function empty() {
  return {
    people: [],
    rsvps: [],
    sponsorships: [],
    admin_sessions: [],
    users: [],
    user_sessions: [],
  }
}

export function loadDb() {
  try {
    if (fs.existsSync(dbPath)) {
      return { ...empty(), ...JSON.parse(fs.readFileSync(dbPath, 'utf8')) }
    }
  } catch (e) {
    console.error('Failed to read DB, starting empty:', e.message)
  }
  return empty()
}

export function saveDb(data) {
  const tmp = `${dbPath}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, dbPath)
}
