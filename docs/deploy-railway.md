# Deploying gbam on Railway

This is the click-by-click guide for putting gbam online with [Railway](https://railway.com).
Railway runs each part of gbam as its own **service** and gives every public one HTTPS
automatically, so there is **no nginx, Caddy or load balancer to set up**: Railway's edge
proxy is the front door.

(`docker/docker-compose.prod.yml` is the same setup for a single server you manage yourself,
such as a Hetzner VPS. You don't need it on Railway.)

## What you'll end up with

| Railway service | What it is                                                            | Built from            | Public domain                                           |
| --------------- | --------------------------------------------------------------------- | --------------------- | ------------------------------------------------------- |
| **Postgres**    | the database (sellers, products, orders)                              | Railway add-on        | none                                                    |
| **Redis**       | the queue for WhatsApp messages, emails and photo cleanup             | Railway add-on        | none                                                    |
| **api**         | the NestJS backend; also runs the database updates before each deploy | `apps/api/Dockerfile` | `api.gbam.app` (Paystack and WhatsApp webhooks call it) |
| **worker**      | the same backend code, only working through the queue                 | `apps/api/Dockerfile` | none                                                    |
| **web**         | the Next.js website                                                   | `apps/web/Dockerfile` | `gbam.app`                                              |

The website talks to the API over Railway's **private network** (traffic never leaves
Railway). Customers and sellers only ever visit `gbam.app`.

## Before you start

- The code is on GitHub (`xIfe3/gbam`), and `main` is pushed.
- You have every value from `.env.production.example` ready: Paystack live key, WhatsApp
  token and IDs, Resend key, R2 keys, and a long random `INTERNAL_API_SECRET`
  (`openssl rand -hex 32`, or any password generator, at least 32 characters).

## Step 1: Create the project and the database

1. Railway dashboard → **New Project → Deploy from GitHub repo** → pick `xIfe3/gbam`.
   Railway creates one service from the repo. You'll turn it into **api** in Step 2.
2. In the project, **+ Create → Database → PostgreSQL**.
3. **+ Create → Database → Redis**.

## Step 2: The api service

Open the service Railway created from the repo, then:

1. **Settings → Service name:** `api`.
2. **Settings → Build:** leave **Root Directory** empty (the Dockerfile needs the whole
   monorepo). Railway finds the Dockerfile through a variable, set in the next step.
3. **Variables:** add these. `${{Postgres.DATABASE_URL}}` and `${{Redis.REDIS_URL}}` are
   Railway "references": they copy the add-on's private address and update by themselves.

   ```env
   RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile
   NODE_ENV=production
   PORT=4000
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   REDIS_URL=${{Redis.REDIS_URL}}
   WEB_URL=https://gbam.app
   PAYSTACK_SECRET_KEY=sk_live_...
   WHATSAPP_ACCESS_TOKEN=...
   WHATSAPP_PHONE_NUMBER_ID=...
   WHATSAPP_APP_SECRET=...
   WHATSAPP_WEBHOOK_VERIFY_TOKEN=...
   RESEND_API_KEY=...
   INTERNAL_API_SECRET=<the long random value>
   R2_ACCOUNT_ID=...
   R2_ACCESS_KEY_ID=...
   R2_SECRET_ACCESS_KEY=...
   R2_BUCKET=gbam-photos
   PHOTOS_PUBLIC_URL=https://photos.gbam.app
   ```

   `PORT=4000` is fixed on purpose: the website needs to know which port to call on the
   private network.

4. **Settings → Deploy → Pre-deploy Command.** This runs before every deploy. It updates
   the database tables, then loads the help, legal and blog pages:
   ```bash
   sh -c "node node_modules/@gbam/db/dist/migrate.js && node node_modules/@gbam/db/dist/sync-content.js"
   ```
   Keep the `sh -c "…"` wrapper: Railway runs this command without a shell, so a bare `&&`
   is not understood and only the first half (migrations) would run. In the deploy logs you
   should see `Migrations up to date` (or `applied`) **and** `Synced N content entries`.
   If it fails, Railway keeps the old version running, so a broken update never goes live.
5. **Settings → Networking → Public Networking → Custom Domain:** `api.gbam.app` (target port
   4000). Railway shows a DNS record (CNAME) to add where you bought `gbam.app`. HTTPS is
   automatic once the DNS is in place.

## Step 3: The worker service

1. **+ Create → GitHub Repo → `xIfe3/gbam`** again. Name it `worker`.
2. **Variables:** the same list as the api. Fastest: in the api's Variables tab use
   **Raw Editor**, copy everything, and paste it into the worker's Raw Editor.
   (`PORT` is harmless here; the worker doesn't listen on it.)
3. **Settings → Deploy → Custom Start Command:**
   ```bash
   node --enable-source-maps dist/worker.js
   ```
4. No pre-deploy command (the api already runs it) and **no public domain**.

## Step 4: The web service

1. **+ Create → GitHub Repo → `xIfe3/gbam`** again. Name it `web`.
2. **Variables:**
   ```env
   RAILWAY_DOCKERFILE_PATH=apps/web/Dockerfile
   API_URL=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:4000
   INTERNAL_API_SECRET=<the same value as the api>
   TRUSTED_PROXY_HOPS=1
   GBAM_WHATSAPP_NUMBER=<your WhatsApp business number, optional>
   ```
   `API_URL` points at the api's private address, which looks like
   `api.railway.internal`. The word before `.RAILWAY_PRIVATE_DOMAIN` must be your API
   service's **exact name** in Railway (e.g. `${{gbam.RAILWAY_PRIVATE_DOMAIN}}` if the service
   is called `gbam`). With the wrong name Railway fills in nothing and you get `http://:4000`. `INTERNAL_API_SECRET` must be **exactly** the same as on the api,
   or the API won't trust the visitor IP the website passes on.
3. **Settings → Networking → Custom Domain:** `gbam.app` (target port 3000). Add the DNS
   record Railway shows. Add `www.gbam.app` too if you want it.

## Step 5: Point Paystack and WhatsApp at the API

- **Paystack** → Settings → API Keys & Webhooks → Webhook URL:
  `https://api.gbam.app/webhooks/paystack`
- **Meta (WhatsApp)** → your app → WhatsApp → Configuration → Webhook:
  - Callback URL: `https://api.gbam.app/webhooks/whatsapp`
  - Verify token: the same value as `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
  - Subscribe to the `messages` field.

## Step 6: First deploy and smoke test

Deploy the services (Railway starts building when you add them; use **Deploy** on any that
are waiting). The api's pre-deploy command creates every table on the empty database.

Then, on your phone:

1. Open `https://gbam.app`. The home page loads with the padlock.
2. Sign up as a seller. The verification email arrives (Resend).
3. Add your bank account (Paystack live resolves it).
4. **Products → Add product** with a photo. The photo shows (R2).
5. Open your shop link, add the product to the basket, place an order.
6. From the dashboard, request payment; pay with a real card for a small amount.
7. The order turns **Paid**, and the WhatsApp messages arrive.

## Step 7: Check the visitor IP once

The login and signup limits count attempts per visitor IP. Railway's edge proxy adds your
real IP to the `X-Forwarded-For` header, and `TRUSTED_PROXY_HOPS=1` tells the website to
read it from there. Check it once after the first deploy:

1. Log in on `gbam.app` (each login saves the visitor IP on its session).
2. In Railway, open the **Postgres** service → **Data** → run:
   ```sql
   select ip, created_at from sessions order by created_at desc limit 1;
   ```
3. The `ip` should be **your phone's or laptop's public IP** (search "what is my IP" to
   compare), not a Railway address such as `100.64.x.x` or `fd12:...`.

If it shows a Railway address, every visitor would share one limit. Tell Claude what the
logs show and the setting will be adjusted.

## Good to know

- **Each push to `main` rebuilds all three services.** To rebuild only what changed, set
  each service's **Settings → Build → Watch Paths** (for example `apps/web/**` and
  `packages/**` for web; `apps/api/**` and `packages/**` for api and worker).
- **Redis must keep queued jobs.** BullMQ needs Redis to never throw jobs away when memory
  fills up. In the Redis service's **Data** tab, run `CONFIG GET maxmemory-policy`. It should
  say `noeviction`; if not, run `CONFIG SET maxmemory-policy noeviction`.
- **Backups:** turn on backups in the Postgres service (**Backups** tab) before real sellers
  use it.
- **Logs:** each service has a Logs tab. "NEEDS REFUND" and "STOCK SHORTFALL" lines from the
  api are the ones to watch for.
- **Secrets** live only in Railway's Variables tabs and your local `.env` files. Never
  commit them.
