# Deploy AgriStat (Vercel frontend + Render API)

This app is a **FastAPI + SQLite** backend with a static HTML frontend. Vercel cannot host the databases well (function size, memory, read-only disk). Use:

| Piece | Host | What it serves |
| --- | --- | --- |
| Frontend | [Vercel](https://vercel.com) | `static/` (landing page + dashboards) |
| API | [Render](https://render.com) | FastAPI + SQLite (`app.py`, `data/*.db`) |
| Source | GitHub | [agristat-data-analytics-platform](https://github.com/jepadasasagristat/agristat-data-analytics-platform) |

Locally you can still run both together:

```bash
python -m uvicorn app:app --host 127.0.0.1 --port 8765
```

---

## 1. Deploy the API on Render (Web Service, Free)

Do **not** use Blueprint. Create a Web Service so you can pick the **Free** instance (no payment method).

1. Open [dashboard.render.com](https://dashboard.render.com) and sign in with GitHub.
2. **New + → Web Service** (not Blueprint).
3. Connect **agristat-data-analytics-platform**. If it is missing from the list, grant Render access (see below), then refresh.
4. Fill in:

   | Setting | Value |
   | --- | --- |
   | Name | `agristat-api` (or any name) |
   | Language | Python 3 |
   | Branch | `main` |
   | Region | closest to you |
   | Build command | `pip install -r requirements.txt` |
   | Start command | `python -m uvicorn app:app --host 0.0.0.0 --port $PORT` |
   | Instance type | **Free** |

5. Under Advanced (if shown):
   - Health check path: `/api/health`
   - Leave auto-deploy on
6. Create Web Service and wait for the first deploy.
7. Enable **Git LFS** on the service if Render shows a Git setting for it (the `.db` files must download).
8. Copy the service URL. This project uses:

   `https://agristat-data-analytics-platform.onrender.com`

9. Open `https://agristat-data-analytics-platform.onrender.com/api/health`. All datasets should show `"ready": true`.

The Free instance **sleeps after idle**. The first request after sleep can take 30–60 seconds.

### Repo not in the Render list

Render only shows GitHub repos the **Render GitHub App** is allowed to access.

1. In the Web Service “Connect a repository” screen, click **Configure account** / **GitHub** / **Adjust GitHub App Permissions**.
2. GitHub opens **GitHub Apps → Render** (or [github.com/settings/installations](https://github.com/settings/installations)).
3. Next to **Render**, click **Configure**.
4. Under **Repository access**, either:
   - **All repositories**, or
   - **Only select repositories** → add `agristat-data-analytics-platform`
5. Save, go back to Render, and click the refresh icon next to the repo list.

Also check:

- You are signed into Render with the **jepadasasagristat** GitHub user (the repo owner).
- The repo URL is [github.com/jepadasasagristat/agristat-data-analytics-platform](https://github.com/jepadasasagristat/agristat-data-analytics-platform).

If Render lets you paste a public Git URL instead of picking from the list, use:

`https://github.com/jepadasasagristat/agristat-data-analytics-platform`

---

## 2. Point Vercel at the static frontend

The existing Vercel project was treating this repo as a Python app. Change it:

1. Vercel project → **Settings → General**
   - **Framework Preset:** Other
   - **Build Command:** `node scripts/write_api_config.js` (from `vercel.json`)
   - **Output Directory:** `static`
   - **Install Command:** leave empty
2. **Settings → Environment Variables** (optional if using the default in `config.js`)
   - Name: `API_ORIGIN`
   - Value: `https://agristat-data-analytics-platform.onrender.com`
   - Apply to Production and Preview
3. Redeploy (Deployments → latest → Redeploy, or push to `main`).

`vercel.json` publishes only `static/` and maps `/dashboards/palay` → `palay.html` (same for corn, fruits, vegetables).

---

## 3. Verify

| URL | Expected |
| --- | --- |
| `https://adap-demo.vercel.app/` | Landing page |
| `https://adap-demo.vercel.app/dashboards/palay` | Palay dashboard |
| `https://agristat-data-analytics-platform.onrender.com/api/health` | JSON, datasets ready |
| Landing snapshots | Charts load from Render |

If the UI loads but snapshots say the API is required, `API_ORIGIN` is missing or wrong. Check `https://adap-demo.vercel.app/assets/config.js` — `AGRI_API_BASE` should be the Render URL.

---

## GitHub

Push to `main` as usual. Then:

- Vercel rebuilds the frontend
- Render rebuilds the API (if auto-deploy is on)

---

## Updating data

Refresh SQLite locally, commit the `.db` files (Git LFS), and push. Render redeploys with the new databases. Vercel does **not** need those files (they are in `.vercelignore`).

---

## Troubleshooting

**Render health shows datasets not ready**  
Git LFS files were not pulled. Enable LFS on the Render Git integration and redeploy.

**Vercel still shows FastAPI / function crashes**  
The project is still in Python/FastAPI mode. Set Framework to Other and Output Directory to `static`, then redeploy.

**CORS errors in the browser**  
The API already allows all origins. Confirm `API_ORIGIN` has `https://` and no trailing slash.

**Slow first load**  
Render free tier is waking from sleep. Upgrade the API instance or hit `/api/health` once before opening the site.
