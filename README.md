# Shabbos RSVP & Coordination

Conditional RSVP form for bi-weekly Shabbos gatherings, with:

- **Public** answers on This Week board
- **Admin-only** sponsorship / money answers (master password)
- **Sunday reset** — each week starts Sunday; board shows only the current week
- **People log** — permanent directory of everyone who ever joined (contact, attendance count, food prefs)

Live site (after you push): `https://<your-user>.github.io/shabbos-rsvp/`

## Quick start (local)

```bash
npm install
npm run dev
```

With `VITE_API_URL` set (see `.env.example`), the app uses the shared live database.
Without it, the app falls back to browser demo mode.

## Live database

Production uses a small API on OrderAssist:

- API: `https://keys.orderassistnow.com/shabbos-api/`
- Data file: `/root/ssl/shabbos-rsvp-api/data/shabbos.json`
- Service: `systemctl status shabbos-rsvp-api`
- Admin master password (server env `SHABBOS_ADMIN_PASSWORD`): default `shabbos-admin`

GitHub Pages builds get `VITE_API_URL` from repo secrets.

## Production setup (GitHub Pages)

1. Push this project to `main` / `master`
2. Repo **Settings → Pages → Build and deployment** → Source: **GitHub Actions**
3. Secret already used in production: `VITE_API_URL=https://keys.orderassistnow.com/shabbos-api`

Site URL: `https://abe-telo.github.io/shabbos-rsvp/#/`

## Pages

| Path | Purpose |
|------|---------|
| `/#/` | Conditional weekly RSVP form |
| `/#/board` | Public this-week answers |
| `/#/people` | Permanent people log |
| `/#/admin` | Unlock sponsorship data with master password |

## Privacy model

- RSVPs and people are readable by everyone through the public API
- Sponsorship / money answers are only returned after admin password unlock
- Public board never shows sponsorship fields

## Sunday week logic

`week_start` is the most recent Sunday (local date). New submissions use the new Sunday automatically. Old weeks remain for attendance history; the board filters to the current week only.

## Scripts

```bash
npm run dev      # local development
npm run build    # production build → dist/
npm run preview  # preview production build
```
