# Migrating austintxhomes.co from Replit to Render

This is the step-by-step migration runbook. Read it once end-to-end before
starting, then work through each section in order.

**Estimated time:** 3-4 focused hours, mostly waiting on uploads/deploys.
**Cost change:** Replit (variable) → Render Standard $25/mo + ~$0.50/mo disk.
**Downtime expected:** ~5 minutes during DNS cutover, otherwise zero (Replit
keeps serving while we set up Render in parallel).

---

## Phase 0 — Prerequisites

You need:
- [ ] GitHub repo access (it's already in `lukeallenrealestate/austintxhomes.co`)
- [ ] Replit dashboard access (to copy env var values)
- [ ] Cloudflare dashboard access (DNS + the R2 credentials we already use)
- [ ] A Render account → sign up at [render.com](https://render.com) (~2 min, can use GitHub login)
- [ ] Your local clone of the repo with up-to-date dependencies

**Before starting, verify your R2 credentials are in `idx-search/.env`:**
```bash
grep R2_ idx-search/.env
```
Should show 5 vars: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`R2_BUCKET`, `R2_PUBLIC_URL`. If any are missing, copy from Replit Secrets first.

---

## Phase 1 — Upload the SQLite DB to R2 (10 min)

The new code on Render will download `idx.db` from R2 on first boot. Upload
your current 1 GB DB to a temporary R2 location.

```bash
cd "/Users/lukeallen/VS Studio"

# Load R2 creds from idx-search/.env
set -a
source idx-search/.env
set +a

# Verify credentials loaded
echo "Bucket: $R2_BUCKET (account: $R2_ACCOUNT_ID)"

# Upload (takes 1-5 min depending on bandwidth)
node scripts/upload-db-to-r2.js
```

When you see `✓ Upload complete`, this phase is done. The DB is now at
`r2://<your-bucket>/_migration/idx.db`.

---

## Phase 2 — Create the Render service (15 min)

1. Go to [dashboard.render.com](https://dashboard.render.com)
2. Click **New +** (top right) → **Blueprint**
3. **Connect your GitHub account** if not already linked
4. Select the **austintxhomes.co** repo
5. Render reads `render.yaml` automatically and shows what will be created:
   - A Web Service named `austintxhomes`
   - A 2 GB persistent disk named `austintxhomes-data` mounted at `/var/data`
   - 25 environment variables (most empty — we'll fill them in next)
6. Click **Apply**

**Do not wait for the first deploy yet — it will fail without secrets.** That's
normal. Move to Phase 3.

---

## Phase 3 — Set environment variables (20-30 min)

In the Render dashboard, click on the **austintxhomes** service → **Environment** tab.

You should see all 25 vars from render.yaml. The ones marked `sync: false` are
the secrets — they're blank and need values from Replit.

**Open Replit dashboard in another tab** → your austintxhomes deployment →
**Secrets** section. Copy each value across to the matching key on Render.

Here's the full checklist with what each one is for:

### MLS / IDX (required — site is dead without these)
- [ ] `MLSGRID_ACCESS_TOKEN` — MLS GRID API token
- [ ] `MLSGRID_ORIGINATING_SYSTEM` — should be `actris`

### Cloudflare R2 (required — photos won't load without these)
- [ ] `R2_ACCOUNT_ID`
- [ ] `R2_ACCESS_KEY_ID`
- [ ] `R2_SECRET_ACCESS_KEY`
- [ ] `R2_BUCKET`
- [ ] `R2_PUBLIC_URL`

### Email (required — contact forms break without these)
- [ ] `EMAIL_HOST` — `smtp.gmail.com`
- [ ] `EMAIL_PORT` — `587`
- [ ] `EMAIL_SECURE` — `false`
- [ ] `EMAIL_USER` — your Gmail address
- [ ] `EMAIL_PASS` — Gmail app password
- [ ] `EMAIL_FROM` — sender address
- [ ] `EMAIL_FROM_NAME` — sender display name
- [ ] `ADMIN_EMAIL` — `Luke@austinmdg.com`

### Auth / API
- [ ] `JWT_SECRET` — any long random string
- [ ] `GOOGLE_CLIENT_ID` — for Google Indexing API
- [ ] `GOOGLE_CLIENT_SECRET`
- [ ] `GOOGLE_REFRESH_TOKEN`
- [ ] `GOOGLE_MAPS_API_KEY`
- [ ] `MAPBOX_PUBLIC_TOKEN`
- [ ] `SENDGRID_API_KEY`
- [ ] `DEAL_RADAR_ADMIN_KEY`

### Defaults / optional
- [ ] `MORTGAGE_RATE` — current rate as a string, e.g. `6.85`

After all 25 are filled in, click **Save Changes**. Render will trigger an
automatic redeploy.

---

## Phase 4 — Watch the first deploy (~10 min)

In the Render dashboard, click the **Logs** tab. You'll see in order:

1. `Cloning repository...`
2. `Running build command...` — installs deps in 3 packages (~3-5 min)
3. `Running pre-deploy command...` (none in our config)
4. `Starting your service...`
5. **`[render-boot] Downloading r2://<bucket>/_migration/idx.db → /var/data/idx.db`** — this is the DB transfer (~1-3 min)
6. `[render-boot] Downloaded 1.00 GB in XXs`
7. `[render-boot] Pre-start hook complete`
8. `[server] Port XXXX open — loading application...`
9. `[server] Austin TX Homes running on port XXXX`
10. `[SYNC] NNNNN listings in DB. Starting incremental sync...`

If you see `[server] running` and `[SYNC] NNNNN listings in DB` with a non-zero
count, **the migration worked.** The DB transferred and your data is intact.

If it fails:
- **Build error** → check the build logs for missing deps. Usually a typo in
  a package.json or a native module that needs a specific Node version.
- **`[boot-init] DB download failed`** → R2 credentials are wrong, or the
  `_migration/idx.db` key doesn't exist. Re-run Phase 1.
- **`[SYNC] 0 listings`** → DB download failed silently; check Logs for
  `[boot-init]` lines.

---

## Phase 5 — Validate on the Render test URL (30-45 min)

Render gives you a `.onrender.com` URL — something like
`https://austintxhomes-XXXX.onrender.com`. Use this to test BEFORE cutting
over DNS. Replit keeps serving the live site at austintxhomes.co the whole time.

Test checklist:
- [ ] Homepage loads — `<RENDER_URL>/`
- [ ] A neighborhood page — `<RENDER_URL>/best-realtor-eanes-isd`
- [ ] A listing — go to `<RENDER_URL>/search?city=Austin`, click any property card
- [ ] Contact form submits — fill out a form, check inbox for the lead email
- [ ] Property photos load (R2 is working)
- [ ] No console errors in browser dev tools
- [ ] TTFB feels fast — 100-300ms

If everything looks good, proceed. **If anything's broken, don't cut over yet** —
fix the issue first. The whole point of testing on the .onrender.com URL is
that visitors are still happily on Replit.

---

## Phase 6 — DNS cutover via Cloudflare (10 min + 5 min propagation)

This is the moment of switching traffic from Replit to Render. ~5 min downtime.

1. In **Cloudflare dashboard** → austintxhomes.co → **DNS**
2. Find the existing record for `austintxhomes.co` (root domain) — currently
   pointing at Replit's IP or hostname.
3. **Edit** that record:
   - Type: `CNAME`
   - Name: `@` (or `austintxhomes.co`)
   - Target: your Render URL **without `https://`** — e.g.
     `austintxhomes-XXXX.onrender.com`
   - Proxy status: **Proxied** (orange cloud — keeps CF caching in front)
4. **Save**
5. If `www` has its own record, update it the same way (target = same Render URL)

DNS propagation takes 1-5 min through Cloudflare. While waiting, **purge the
Cloudflare cache** so old cached responses don't keep getting served:
- Cloudflare dashboard → Caching → Configuration → **Purge Everything**

After purge: visit https://austintxhomes.co. It should now be served from Render
(via Cloudflare cache). Check the response header `server: cloudflare` and your
Render logs to confirm traffic is hitting it.

---

## Phase 7 — Verify everything works on production (15 min)

Same checklist as Phase 5, but on the real URL now:
- [ ] Homepage, listings, search, contact forms all work
- [ ] CF cache rule still HITs (curl -sI shows `cf-cache-status: HIT`)
- [ ] Render logs show real visitor traffic
- [ ] Replit dashboard shows traffic dropping toward zero

---

## Phase 8 — Shut down Replit (5 min, after 24-48h of monitoring)

**Wait 24-48 hours** before disabling Replit. If anything goes wrong on Render,
you can revert by switching the Cloudflare DNS record back. Once you're
confident Render is stable:

1. Replit dashboard → austintxhomes deployment → **Stop** the deployment
2. (Optional) **Delete** the deployment to stop billing — keep the Repl for
   archive if you want
3. Update repo README / any docs noting Replit is no longer the host

---

## Phase 9 — Clean up the R2 migration object (1 min)

The 1 GB `_migration/idx.db` in R2 was a one-time transfer artifact. Delete it
to save storage cost:

```bash
# From Cloudflare R2 dashboard → your bucket → _migration/ folder → delete
# Or via CLI:
aws s3 rm --endpoint-url=https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com \
  s3://<R2_BUCKET>/_migration/idx.db
```

---

## Rollback plan (if something goes badly wrong)

At any point during the migration:

1. Cloudflare dashboard → DNS → change the `austintxhomes.co` CNAME back to
   the Replit URL (or whatever it pointed at before Phase 6).
2. Purge Cloudflare cache.
3. Verify the site is loading from Replit again.
4. Investigate what went wrong on Render, fix, retry.

Because we never deleted anything on Replit, rollback is always available.

---

## What's different about Render vs Replit (FYI)

- **Container size:** 2 GB RAM, 1 CPU vs Replit's ~0.5 CPU shared
- **Health checks:** Render polls `/api/config` and auto-restarts on failure;
  Replit just kills containers that hit CPU limits with no real recovery
- **Persistent disk:** Render has true persistent storage that survives
  redeploys; Replit's was less reliable
- **Cron behavior:** node-cron inside the Node process works the same;
  Render Web Services don't have separate cron-only plans (we could split to
  a Worker later for the MLS sync, but not needed yet)
- **SSH access:** Available on the service shell tab — useful if we ever need
  to inspect logs in real-time or run one-off migrations
- **Deploy trigger:** Git push to main → Render auto-deploys (~3-5 min)
