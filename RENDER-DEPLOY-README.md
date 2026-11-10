# Lamp & Light Coaching — putting the program on Render

This folder is the whole program, ready to go up: the master's own
lessons and pages, the sign-in door, and the engine that saves each
student's work privately. It goes to **GitHub first**, then **Render**
reads it from GitHub and runs it.

Nothing in here is live yet. Uploading it changes nothing on
lampandlightcoaching.com — the live site keeps running untouched
until a later step points the domain at Render.

## What's deliberately NOT in this folder

- **No student data, and no accounts stored here at all.** Student
  accounts live in **Supabase Auth** — the same sign-in the current
  live site uses — so there are no accounts in this bundle to carry.
  The production database starts completely empty of saved work. Your
  own saved work, and the one existing student's 31 saved answers,
  are imported in a later step (Phase 4), counted on both sides so
  nothing is lost; her account and password stay exactly as they are
  in Supabase. Test-bench data (including the `james@test.local`
  bench login) has no business in production and was left out on
  purpose.
- **No passwords or secret keys of any kind.** This program needs
  none to run: it checks each student's sign-in against Supabase's
  published signing keys. (One optional name, `SUPABASE_JWT_SECRET`,
  is listed in the settings below — it stays blank unless Supabase
  ever needs the older shared-secret check, and if it's ever used,
  its value is typed into Render's dashboard by hand, never written
  into any file.)

## Step 1 — Put this folder on GitHub

1. Unzip the bundle so you have the `render-deploy` folder.
2. Go to **github.com**, sign in (create your account first if you
   don't have one), click the **+** at the top right → **New
   repository**.
3. Name it `lamp-and-light-coaching`, choose **Private**, and click
   **Create repository**.
4. On the empty repo's page, click **uploading an existing file**.
5. Open the `render-deploy` folder on your computer, select
   **everything inside it** (the files and the `client`, `server`,
   and `scripts` folders — so that `package.json` and `render.yaml`
   end up at the TOP of the repo, not inside a subfolder), and drag
   it all onto the GitHub page.
6. Click **Commit changes**. (Every file here is small — the largest
   is about 300 KB, far under GitHub's 25 MB per-file limit.)

## Step 2 — Create the service on Render (the easy way)

1. Go to **dashboard.render.com**, sign in.
2. Click **New** → **Blueprint**, pick the `lamp-and-light-coaching`
   repo, and click **Apply**.
3. The repo's `render.yaml` fills in every setting below by itself.
   Render will ask you to confirm the plan charge (see Step 3).

## Step 2 (by hand) — the exact settings, if you create it manually

Click **New** → **Web Service** (NOT "Static Site" — the program is a
live server, not static files), connect the repo, and fill in:

| Setting | Value |
|---|---|
| Name | `lamp-and-light-coaching` |
| Runtime | **Node** (that's Render's label — the commands below run Bun, which is what the program is built on; this matches Bun's own Render guide) |
| Build Command | `bun install && bun run build:client` |
| Start Command | `bun run start` |
| Instance Type / Plan | **Starter** — $7/month |
| Health Check Path | `/health` |

**Environment variables** (none of these values are secret):

| Name | Value |
|---|---|
| `HOST` | `0.0.0.0` |
| `DB_PATH` | `/var/data/lampandlight.db` |
| `SUPABASE_URL` | `https://vaikkfgrnwiqmbueridr.supabase.co` |
| `SUPABASE_JWT_SECRET` | *(leave blank — see the note above)* |

The Blueprint (`render.yaml`) fills these in by itself. The program
refuses to start if `SUPABASE_URL` is missing, so a setup mistake
fails loudly instead of running without sign-in.

Do **not** add a `PORT` variable — Render assigns the port itself and
the program reads it automatically.

**Persistent disk** (this is the important one — it's where every
student's saved work lives, so it survives updates; accounts
themselves live in Supabase):

| Setting | Value |
|---|---|
| Disk name | `lampandlight-data` |
| Mount path | `/var/data` |
| Size | 1 GB (about $0.25/month) |

## Step 3 — What it costs

Starter service $7/month + 1 GB disk about $0.25/month ≈ **$7.25 a
month**, inside the $7–35 range already discussed. (The optional
Supabase Pro upgrade at $25/month is a separate decision, not part of
this.)

## What happens on the first start

The Start Command first runs a small setup script that creates the
empty database tables on the disk, then starts the program. It runs
again on every start and is harmless — it never touches student data.
Students sign in (or create an account) with email and password on
the program's own sign-in screen, handled by Supabase Auth — no
confirmation email, exactly like the current live site. Each
student's saved work is stored under their Supabase account, so one
student can never see another's.

## Sign-in — decided (2026-11-10)

Sign-in is **Supabase Auth**, decided by James on 2026-11-10: the
same email-and-password sign-in the current live site uses, so the
existing student keeps her password and her saved answers can be
imported under her existing account in Phase 4. The test bench's
local accounts layer is NOT in this bundle.

Also still to come, in later steps: connecting the
lampandlightcoaching.com name to Render, importing your data and the
existing student's saved answers, and nightly database backups.
