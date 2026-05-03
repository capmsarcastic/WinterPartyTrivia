# Winter Party Trivia — Setup Guide

This guide walks you through getting the app running end-to-end.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Python | 3.11+ | https://python.org |
| Node.js | 18+ | https://nodejs.org |
| pip | latest | comes with Python |

You also need accounts on:
- **Supabase** (free): https://supabase.com
- **Render** (Starter tier, ~$7/mo for the event month): https://render.com

---

## 1. Supabase — Database Setup

1. Log in to [supabase.com](https://supabase.com) and open your project.
2. In the left sidebar, go to **SQL Editor → New query**.
3. Copy the entire contents of `schema.sql` and paste it into the editor.
4. Click **Run**. You should see success messages for each statement.
   - If you see "already exists" errors for the realtime publication lines, that's fine — skip them.

5. Grab your project credentials from **Settings → API**:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon / public key** (for the frontend)
   - **service_role key** (for the backend — keep this secret)

---

## 2. Frontend — Local Development

```bash
cd frontend
cp .env.example .env.local
```

Edit `frontend/.env.local` and fill in your Supabase values:

```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

Then install and run:

```bash
npm install
npm run dev
```

The frontend runs at http://localhost:5173 and automatically proxies `/api` requests to the backend.

---

## 3. Backend — Local Development

From the repo root:

```bash
pip install -r requirements.txt
```

Create a `.env` file in the repo root (never commit this):

```
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
ADMIN_PASSWORD=your-chosen-admin-password
```

Run the backend:

```bash
uvicorn main:app --reload --port 8000
```

The app is now live:
- Player app: http://localhost:5173 (served by Vite dev server)
- Admin panel: http://localhost:5173/admin
- API: http://localhost:8000/api

---

## 4. Production Build

Build the React frontend into static files:

```bash
cd frontend && npm run build
```

This creates `frontend/dist/`. When deployed on Render, FastAPI serves these files automatically.

---

## 5. Deploying to Render

### Create a new Web Service

1. Go to [render.com](https://render.com) → **New → Web Service**
2. Connect your GitHub repo
3. Set:
   - **Environment**: Python
   - **Build command**: `pip install -r requirements.txt && cd frontend && npm install && npm run build`
   - **Start command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Plan**: **Starter** ($7/mo) — avoids cold starts during the event

### Environment variables (set in Render dashboard)

| Variable | Value |
|----------|-------|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key |
| `ADMIN_PASSWORD` | Your chosen admin password |

> ⚠️ Never put these values in source code or commit them to git.

---

## 6. Configuring the Event

### Before the night

1. Log into the admin panel at `https://your-app.onrender.com/admin`
2. Go to **Rounds** and create your rounds and questions
3. Set the admin's event config branding if desired (in Dashboard → Event controls)
4. Keep **Team creation** enabled so players can start forming teams

### Image presets

The database ships with emoji-based team images. To add your own custom images later:

```sql
INSERT INTO image_presets (id, emoji, category, display_name)
VALUES ('my_custom', '🦄', 'Office', 'Our Mascot');
```

### Customising strings / in-jokes

Edit `frontend/src/strings.ts` and rebuild. All player-facing text is in one place.

### Customising the colour theme

Edit the CSS custom properties at the top of `frontend/src/index.css` and rebuild.

---

## 7. Night-of Flow

1. **Before guests arrive**: Create rounds + questions in admin panel
2. **Doors open**: Leave team creation enabled; approve teams as they come in
3. **Lock teams**: When ready to start, lock team creation (Dashboard toggle)
4. **Each round**:
   - Push players to round answer page (Dashboard → Push navigation)
   - Give a 30-second verbal warning before locking
   - Lock the round → submissions are auto-snapshotted
   - Mark answers in the **Marking grid** (auto-marks where possible)
   - Click **Commit scores** → creates score events, advances to "marked"
   - Read out answers verbally
   - Click **Reveal to players** → results appear in their lobby
5. **Leaderboard moments**: Go to Leaderboard and broadcast standings

---

## 8. Troubleshooting

### "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing"
Check your Render environment variables are set correctly.

### Players see "No teams yet"
Either no teams have been approved yet, or team creation is locked and no teams were pre-approved.

### Admin login says "Too many attempts"
Rate limit: 5 failed attempts per 10 minutes per device. Wait 10 minutes or restart the Render service to clear in-memory state.

### Realtime not updating
Check the browser console for Supabase realtime errors. Make sure the tables were added to the `supabase_realtime` publication in the schema step.

### Draft saves failing with 409
The round has been locked. Drafts are read-only once locked.
