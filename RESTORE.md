# FioTech v1.0 — Restore Guide

If you lose your local code, follow these steps to fully restore the project.

## Step 1: Clone the repo

```bash
git clone https://github.com/Andylaw95/FioTech_V1.git
cd FioTech_V1
npm install
```

## Step 2: Run locally

```bash
npm run dev
```

The app should be running at `http://localhost:5173`.

---

## Step 3: Deploy Frontend to Vercel

The `.vercel/project.json` is already included in the repo, so Vercel knows which project to deploy to.

```bash
npx --yes vercel --prod
```

If it asks you to log in, run `npx vercel login` first.

- **Vercel Project**: `fiotech-app`
- **Live URL**: https://fiotech-app.vercel.app
- **Vercel Org ID**: `team_0FO1nU15ZJPromQYo0Znptga`
- **Vercel Project ID**: `prj_3znMxfpXcoezcdx2aoEbGzU04zrO`

---

## Step 4: Deploy Backend (Supabase Edge Functions)

You need a **Supabase Access Token** to deploy. Get one at:
https://supabase.com/dashboard/account/tokens

Then run:

```bash
export SUPABASE_ACCESS_TOKEN="your_token_here"

# Copy server source to deploy folder
cp supabase/functions/server/routes.tsx supabase/functions/make-server-4916a0b9/routes.tsx
cp supabase/functions/server/seed_data.tsx supabase/functions/make-server-4916a0b9/seed_data.tsx

# Deploy
npx -y supabase@2.76.14 functions deploy make-server-4916a0b9 --project-ref wjvbojulgpmpblmterfy
```

### Supabase Config (already in code)
- **Project Ref**: `wjvbojulgpmpblmterfy`
- **Edge Function**: `make-server-4916a0b9`
- **KV Store Table**: `kv_store_4916a0b9`
- **Anon Key**: (see `utils/supabase/info.tsx`)

---

## Summary of Key URLs

| Service       | URL                                                                 |
|---------------|---------------------------------------------------------------------|
| Frontend      | https://fiotech-app.vercel.app                                      |
| Backend API   | https://wjvbojulgpmpblmterfy.supabase.co/functions/v1/make-server-4916a0b9 |
| Supabase Dashboard | https://supabase.com/dashboard/project/wjvbojulgpmpblmterfy     |
| GitHub Repo   | https://github.com/Andylaw95/FioTech_V1                            |
