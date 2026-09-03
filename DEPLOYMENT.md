# Deploying AgriStat to Vercel

This guide covers deploying the **AgriStat Data Analytics Platform** (FastAPI + static dashboards + SQLite) to [Vercel](https://vercel.com).

## What you are deploying

| Layer | Technology |
| --- | --- |
| Frontend | Static HTML/CSS/JS in `static/` |
| API | FastAPI (`app.py`) |
| Data | SQLite files in `data/` (`palay_corn.db`, `fruits.db`, `vegetables.db`) |

Locally you run:

```bash
python -m uvicorn app:app --host 127.0.0.1 --port 8765
```

On Vercel, all routes are handled by a Python serverless function (`api/index.py`).

---

## Important constraints on Vercel

Read this before deploying.

### 1. Bundle size

The bundled SQLite databases are large (roughly **520 MB** uncompressed with the full current datasets):

| File | Approx. size |
| --- | --- |
| `data/palay_corn.db` | ~15 MB |
| `data/fruits.db` | ~175 MB |
| `data/vegetables.db` | ~320 MB |

Vercel Python functions have a **500 MB** standard bundle limit. With all three datasets you will likely need **Large Functions** (up to 5 GB).

In the Vercel project, add this environment variable before deploying:

```text
VERCEL_SUPPORT_LARGE_FUNCTIONS=1
```

Fluid Compute must be enabled (default for new projects).

### 2. Read-only filesystem

Vercel functions cannot write to the project directory at runtime. The app detects `VERCEL=1` and:

- Opens SQLite databases **read-only**
- Disables the weekly APScheduler job
- Disables `/api/refresh` (PSA scraping)

To update data: refresh locally, rebuild databases, commit, and redeploy.

### 3. Cold starts

Large SQLite files increase cold-start time and memory use. `vercel.json` requests **2048 MB** memory (Hobby plan maximum) and **300s** max duration for the API function.

### 4. Alternative platforms

If you want always-on scraping, background refresh, and simpler SQLite writes, consider **Railway**, **Render**, or **Fly.io** instead. Vercel is a good fit when you mainly need to **serve pre-built data**.

---

## Prerequisites

1. A [Vercel account](https://vercel.com/signup)
2. [Git](https://git-scm.com/) repository with this project
3. [Vercel CLI](https://vercel.com/docs/cli) (optional but useful)

   ```bash
   npm i -g vercel
   ```

4. Data files committed to Git:
   - **Option A (recommended for first deploy):** commit the `.db` files in `data/`
   - **Option B:** commit only the `*_long.csv` files and let the build script create `.db` files (slower build, same final size)

---

## Project files for Vercel

These files are already included in the repo:

```text
api/index.py          # Serverless entrypoint
vercel.json           # Routes, build command, function limits
scripts/vercel_build.py  # Builds SQLite from CSV during deploy
.vercelignore         # Excludes unneeded files from upload
```

`app.py` automatically switches to serverless mode when `VERCEL=1` (set by Vercel during deploy).

---

## Step 1 — Prepare the repository

### Commit data

Make sure `data/` contains either the databases or the long CSV files:

```text
data/
  palay_corn.db          # or palay_corn_long.csv
  fruits.db              # or fruits_long.csv
  vegetables.db          # or vegetables_long.csv
  data_status.json
```

Do **not** commit WAL sidecar files (`*.db-shm`, `*.db-wal`). Add to `.gitignore` if needed:

```gitignore
data/*.db-shm
data/*.db-wal
data/raw/
```

### Push to GitHub/GitLab/Bitbucket

Vercel deploys from a connected Git repo.

---

## Step 2 — Create the Vercel project

### Option A: Vercel Dashboard

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your Git repository
3. Framework Preset: **Other**
4. Root Directory: `.` (project root)
5. Build Command: leave default (`python scripts/vercel_build.py` from `vercel.json`)
6. Output Directory: leave empty
7. Install Command: Vercel auto-detects Python and installs `requirements.txt`

### Option B: Vercel CLI

From the project root:

```bash
vercel login
vercel
```

Follow the prompts for a preview deployment. For production:

```bash
vercel --prod
```

---

## Step 3 — Environment variables

In **Project → Settings → Environment Variables**, add:

| Variable | Value | Required |
| --- | --- | --- |
| `VERCEL_SUPPORT_LARGE_FUNCTIONS` | `1` | Yes, if total bundle > 500 MB |

Apply to **Production**, **Preview**, and **Development**.

No other secrets are required for a read-only public dashboard.

---

## Step 4 — Deploy

1. Push to your default branch (if using Git integration), or run `vercel --prod`
2. Watch the build log for:

   ```text
   Building palay_corn.db from palay_corn_long.csv…
   Building fruits.db from fruits_long.csv…
   Building vegetables.db from vegetables_long.csv…
   Vercel build data step complete.
   ```

   If `.db` files are already committed, the script skips rebuilding them.

3. Wait for the deployment to finish

---

## Step 5 — Verify

Open your deployment URL and check:

| URL | Expected |
| --- | --- |
| `/` | Landing page |
| `/dashboards/palay` | Palay dashboard |
| `/api/health` | JSON with `"ok": true` and datasets ready |
| `/api/landing/summary` | Production snapshot data |

Example:

```bash
curl https://YOUR-PROJECT.vercel.app/api/health
```

All datasets should show `"ready": true`. If any show `false`, the corresponding `.db` file was missing from the deployment bundle.

---

## Updating data after deploy

Because PSA refresh is disabled on Vercel:

1. On your local machine, refresh data:

   ```bash
   python -m scraping.pipeline
   # or run individual fetch/reshape scripts
   ```

2. Confirm `data/*.db` are updated
3. Commit and push (or run `vercel --prod`)
4. Vercel redeploys with the new databases

---

## Custom domain (optional)

1. Vercel project → **Settings → Domains**
2. Add your domain (e.g. `agristat.example.gov.ph`)
3. Update DNS records as instructed by Vercel
4. HTTPS is provisioned automatically

---

## Troubleshooting

### Build fails: function exceeded size limit

- Set `VERCEL_SUPPORT_LARGE_FUNCTIONS=1`
- Ensure Fluid Compute is enabled
- Remove unneeded files from the repo (raw scrapes in `data/raw/`)
- Check `.vercelignore` is excluding `data/raw/**`

### `/api/health` shows datasets not ready

- Confirm `data/*.db` exist in Git or CSV build step succeeded in build logs
- Run locally: `python scripts/vercel_build.py`

### Dashboard loads but charts are empty

- Open browser DevTools → Network
- Check `/api/*` responses for 503 errors
- Usually means the dataset SQLite file is missing or corrupt

### Build times out while creating databases

- Commit pre-built `.db` files instead of building from CSV on Vercel
- Or deploy only palay/corn first (smaller bundle) for testing

### `POST /api/refresh` returns 501

- Expected on Vercel. Refresh data locally and redeploy.

### Slow first load after idle

- Normal for large serverless functions (cold start)
- Consider upgrading plan or using a always-on host if this is unacceptable

---

## Local Vercel simulation

Test the production entrypoint locally:

```bash
pip install -r requirements.txt
python scripts/vercel_build.py
vercel dev
```

`vercel dev` emulates the serverless routing defined in `vercel.json`.

---

## Summary checklist

- [ ] Data files (`.db` or `*_long.csv`) committed to Git
- [ ] `VERCEL_SUPPORT_LARGE_FUNCTIONS=1` set (if using full datasets)
- [ ] Repository connected to Vercel
- [ ] Deploy succeeded
- [ ] `/api/health` returns all datasets ready
- [ ] Landing page and at least one dashboard load correctly
- [ ] Custom domain configured (optional)

---

## Need help?

- [Vercel Python docs](https://vercel.com/docs/functions/runtimes/python)
- [Vercel function limits](https://vercel.com/docs/functions/limitations)
- [FastAPI on Vercel template](https://vercel.com/templates/python/fastapi-python-boilerplate)
