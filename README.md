# Shabbos RSVP & Coordination

Conditional RSVP form for bi-weekly Shabbos gatherings, with:

- **Public** answers on This Week board
- **Admin-only** sponsorship / money answers (master password)
- **Sunday reset** — each week starts Sunday; board shows only the current week
- **People log** — permanent directory of everyone who ever joined (contact, attendance count, food prefs)

Live site (after you push): `https://<your-user>.github.io/shabbos-rsvp/`

## Quick start (local demo)

Works immediately with no backend — data stays in the browser.

```bash
npm install
npm run dev
```

Open the URL Vite prints. Demo admin password: `shabbos-admin` (change via `VITE_DEMO_ADMIN_PASSWORD` in `.env`).

## Production setup

### 1. Supabase

1. Create a free project at [supabase.com](https://supabase.com)
2. **SQL Editor** → paste and run [`supabase/schema.sql`](supabase/schema.sql)
3. Copy **Project URL** and **anon public** key from **Settings → API**
4. Install [Supabase CLI](https://supabase.com/docs/guides/cli) and link the project
5. Set the master password and deploy the Edge Function:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set ADMIN_PASSWORD="your-master-password"
supabase functions deploy admin-unlock --no-verify-jwt
```

Or paste [`supabase/functions/admin-unlock/index.ts`](supabase/functions/admin-unlock/index.ts) via the Dashboard → Edge Functions.

### 2. Environment

Copy `.env.example` to `.env`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

### 3. GitHub Pages

1. Create a GitHub repo named `shabbos-rsvp` (or update `base` / `VITE_BASE` to match)
2. Push this project to `main` or `master`
3. Repo **Settings → Pages → Build and deployment** → Source: **GitHub Actions**
4. Add repository secrets:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. The workflow in [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) builds and deploys

Site URL: `https://<user>.github.io/shabbos-rsvp/#/`

## Pages

| Path | Purpose |
|------|---------|
| `/#/` | Conditional RSVP form |
| `/#/board` | Public this-week answers |
| `/#/people` | Permanent people log |
| `/#/admin` | Unlock sponsorship data with master password |

## Privacy model

- `rsvps` and `people` are readable by everyone (anon key)
- `sponsorships` allow **insert only** for the public; **no select** via RLS
- Admin unlock calls the `admin-unlock` Edge Function, which checks `ADMIN_PASSWORD` and returns rows with the service role

## Sunday week logic

`week_start` is the most recent Sunday (local date). New submissions use the new Sunday automatically. Old weeks remain for attendance history; the board filters to the current week only.

## Scripts

```bash
npm run dev      # local development
npm run build    # production build → dist/
npm run preview  # preview production build
```
