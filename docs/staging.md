# Staging on Railway

A second copy of Gbam for trying changes before customers see them. It deploys from the
`staging` branch; production deploys from `main`.

**How changes flow:** feature branch → merge into `staging` → test on staging → merge
`staging` into `main` (production).

## 1. Create the environment

In the Railway project: **Environments → New environment → `staging`** (start empty, or
duplicate production and then change every value below; never keep production's database or
Redis). Staging needs its own:

| Service | Notes |
| --- | --- |
| Postgres | New database. Never point staging at production's. |
| Redis | New. Staging's background jobs must never see production's queues. |
| API | Same repo, **branch `staging`**, root `apps/api`, same build/start/pre-deploy commands as production (the pre-deploy step runs the migrations on staging's database). |
| Worker | Same as production's worker, **branch `staging`**. |
| Web | Same repo, **branch `staging`**, root `apps/web`. |

Give it its own domains, for example `staging.gbam.app` (web) and `api-staging.gbam.app`
(API), or use Railway's generated ones.

## 2. Variables

**Every secret must be different from production's.** Generate new ones with
`openssl rand -base64 32` (or `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`).

### API and Worker (same values in both)

| Variable | Staging value |
| --- | --- |
| `NODE_ENV` | `production` (staging should run like the real thing) |
| `APP_ENV` | `staging` (adds "[Staging]" to every email subject; tags Sentry errors) |
| `DATABASE_URL` | staging Postgres (Railway reference variable) |
| `REDIS_URL` | staging Redis (Railway reference variable) |
| `WEB_URL` | the staging website, e.g. `https://staging.gbam.app` |
| `PAYSTACK_SECRET_KEY` | your Paystack **test** secret key (`sk_test_…`) |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Meta's free **test number** (WhatsApp → API Setup in your Meta app), not the live number |
| `WHATSAPP_APP_SECRET` | the Meta app secret |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | a new random string |
| `RESEND_API_KEY` | can be the same Resend account; see the email warning below |
| `EMAIL_FROM` | e.g. `Gbam Staging <staging@gbam.app>` |
| `INTERNAL_API_SECRET` | new random string, **at least 32 characters**, same value on staging's Web |
| `ADMIN_TOTP_KEY` | new random value. Then run `create-superadmin` once on staging's API |
| `UNSUBSCRIBE_SIGNING_KEY` | new random value |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | an R2 token for a **separate bucket** |
| `R2_BUCKET` | e.g. `gbam-staging-photos` |
| `PHOTOS_PUBLIC_URL` | that bucket's public address |
| `SENTRY_DSN` | same Sentry project is fine: errors show as environment "staging" |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | optional (System page) |
| `UPTIME_API_KEY` | leave empty: only production needs uptime checks |

### Web

| Variable | Staging value |
| --- | --- |
| `NEXT_PUBLIC_APP_ENV` | `staging` (banner on every page; search engines kept out). Set it **before** the first build: it's baked in when the site is built. |
| `NEXT_PUBLIC_SITE_URL` | the staging website, e.g. `https://staging.gbam.app` |
| `API_URL` | staging API's address (Railway private network address is best) |
| `INTERNAL_API_SECRET` | the same value as staging's API |
| `TRUSTED_PROXY_HOPS` | same as production (`1`) |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | same as production is fine |
| `GBAM_WHATSAPP_NUMBER` | optional |

## 3. Outside Railway

- **Paystack** (test mode): Settings → API Keys & Webhooks → **Test** webhook URL:
  `https://<staging-api>/webhooks/paystack`. Test cards are in Paystack's docs
  (e.g. 4084 0840 8408 4081).
- **Meta / WhatsApp**: the test number's webhook points to
  `https://<staging-api>/webhooks/whatsapp`, with staging's verify token. Add your own phone as
  a test recipient (the test number can only message numbers you add).
- **Resend**: staging sends real emails. Only use email addresses you own when testing, and
  never copy production data into staging (it would email real sellers).
- **UptimeRobot**: production only.

## 4. Check it works

1. Open the staging site: a dark "Staging" strip should show at the top.
2. `https://<staging-site>/robots.txt` should say `Disallow: /`.
3. `https://<staging-api>/health` should answer `{"status":"ok",...}`.
4. Sign up a test shop with your own email: the code email's subject starts with `[Staging]`.
5. Place an order and pay with a Paystack test card: the order becomes Paid.
6. Sign in to `/admin` with the superadmin you created on staging.
