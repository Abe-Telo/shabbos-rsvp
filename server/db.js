import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const dataDir = process.env.SHABBOS_DATA_DIR || path.join(__dirname, 'data')
fs.mkdirSync(dataDir, { recursive: true })

export const foodPhotosDir = path.join(dataDir, 'food-photos')
fs.mkdirSync(foodPhotosDir, { recursive: true })

const dbPath = path.join(dataDir, 'shabbos.json')

function empty() {
  return {
    people: [],
    rsvps: [],
    sponsorships: [],
    admin_sessions: [],
    users: [],
    user_sessions: [],
    week_settings: {},
    holiday_event: {
      enabled: false,
      holiday_id: null,
      title: '',
      statement: '',
      meals: [],
    },
    holiday_rsvps: [],
    holiday_food_items: [],
  }
}

export function loadDb() {
  try {
    if (fs.existsSync(dbPath)) {
      const parsed = JSON.parse(fs.readFileSync(dbPath, 'utf8'))
      return {
        ...empty(),
        ...parsed,
        week_settings: parsed.week_settings || {},
        holiday_event: {
          ...empty().holiday_event,
          ...(parsed.holiday_event || {}),
          meals: Array.isArray(parsed.holiday_event?.meals)
            ? parsed.holiday_event.meals
            : [],
        },
        holiday_rsvps: Array.isArray(parsed.holiday_rsvps)
          ? parsed.holiday_rsvps
          : [],
        holiday_food_items: Array.isArray(parsed.holiday_food_items)
          ? parsed.holiday_food_items
          : [],
      }
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
