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

## 1. Deploy the API on Render

1. Open [dashboard.render.com](https://dashboard.render.com) and sign in with GitHub.
2. **New → Blueprint** (or **New → Web Service**) and select this repository.
3. If using the included `render.yaml`, Render will create `agristat-api`.
4. Manual settings if you skip the blueprint:
   - **Runtime:** Python 3
   - **Build command:** `pip install -r requirements.txt`
   - **Start command:** `python -m uvicorn app:app --host 0.0.0.0 --port $PORT`
   - **Health check:** `/api/health`
5. Enable **Git LFS** for the repo (Render must download `data/*.db`).
6. Deploy. Copy the service URL, for example:

   `https://agristat-api.onrender.com`

7. Confirm:

   `https://YOUR-API.onrender.com/api/health`

   All datasets should show `"ready": true`.

Render’s free web service **sleeps after idle**. The first request after sleep can take 30–60 seconds. A paid instance stays awake.

---

## 2. Point Vercel at the static frontend

The existing Vercel project was treating this repo as a Python app. Change it:

1. Vercel project → **Settings → General**
   - **Framework Preset:** Other
   - **Build Command:** `node scripts/write_api_config.js` (from `vercel.json`)
   - **Output Directory:** `static`
   - **Install Command:** leave empty
2. **Settings → Environment Variables**
   - Name: `API_ORIGIN`
   - Value: your Render URL with **no trailing slash**  
     Example: `https://agristat-api.onrender.com`
   - Apply to Production and Preview
3. Redeploy (Deployments → latest → Redeploy, or push to `main`).

`vercel.json` publishes only `static/` and maps `/dashboards/palay` → `palay.html` (same for corn, fruits, vegetables).

---

## 3. Verify

| URL | Expected |
| --- | --- |
| `https://adap-demo.vercel.app/` | Landing page |
| `https://adap-demo.vercel.app/dashboards/palay` | Palay dashboard |
| `https://YOUR-API.onrender.com/api/health` | JSON, datasets ready |
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
