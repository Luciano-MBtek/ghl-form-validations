## Booking Architecture

- BookingStep (client) -> `/api/availability` (server) -> LeadConnector free-slots (external).
- BookingWizard orchestrates steps and never calls LeadConnector directly.
- The server normalizes availability to `{ [YYYY-MM-DD]: { slots: string[] } }`.
- Lead-time and weekend/today filtering happens on the server; the UI must render exactly what the server returns (no local date/time generation).
- Appointments are created by `/api/appointments` (separate step).

Key files:

- `src/components/BookingWizard.tsx`
- `src/components/BookingStep.tsx`
- `src/app/api/availability/route.ts`
- `src/app/api/appointments/route.ts`

Sequence (simplified):

```
BookingStep (client)
  -> GET /api/availability (server)
      -> LeadConnector (free-slots)
      <- normalized slots { [YYYY-MM-DD]: { slots: ISO[] } }
<- render dates/times from normalized payload
```

## Overview

This repository is a Next.js 14+ (App Router) application that renders validated lead forms and upserts contacts into LeadConnector (GHL). The app provides live server-side validation for email and phone on blur, optional workflow enrollment, and dynamic form fields defined in a JSON registry.

High-level flow:

- Client LeadForm renders a form (from `src/app/forms/registry.json`) and performs live validation on blur via `POST /api/validate`.
- `POST /api/validate` calls Mailboxlayer (email) and Numverify (phone) server-side with short-term caching and soft-pass timeouts.
- On submit, the client posts to `POST /api/lead`; the server revalidates and upserts/updates a contact in LeadConnector with tags and optional workflow enrollment.
- Client UI shows pending spinners, green checks on valid, and red errors on invalid; stale responses are ignored using AbortController and echoed values.

## Validation Strategy

The app uses a **confidence-based validation approach** that prioritizes user experience while maintaining data quality:

- **Score is a signal only**: Email scores from Mailboxlayer are used for confidence buckets but don't block submission
- **Only block on definitive undeliverable signals**: Bad format, no MX records, SMTP failures, or (optionally) disposable/role emails
- **Confidence buckets**: `good` (score ≥ 0.80), `medium` (score ≥ 0.50), `low` (score < 0.50), `unknown` (timeout/error)
- **GHL tags for workflow segmentation**: Contacts receive tags like `EmailLowScore`, `EmailUnknown`, `PhoneVOIP` for conditional workflow routing
- **UI feedback**: Green "Looks good" for high confidence, gray "Looks okay; we'll confirm after submit" for uncertain cases

## Tech Stack

- Next.js: 15.5.2 (App Router)
- React: 19
- TypeScript
- Tailwind CSS v4 + `@tailwindcss/forms`
- External APIs: Mailboxlayer (email), Numverify (phone), LeadConnector Integrations API (contacts, workflow)

## Directory & File Map

```
src/
  app/
    layout.tsx                 # Root HTML/body; imports globals.css; light base
    globals.css                # Tailwind v4 preflight + utilities
    page.tsx                   # Redirects to a default form route
    forms/
      [slug]/page.tsx          # Server component; loads form by slug and renders card + LeadForm
      registry.json            # Form registry: slugs, names, env-resolved IDs, sections/fields
    api/
      validate/route.ts        # POST /api/validate: email/phone validation (rate-limited), echoes inputs
      lead/route.ts            # POST /api/lead: revalidate; upsert contact; optional workflow; returns { ok, contactId }
  components/
    LeadForm.tsx               # Client component; blur-based validation UX; renders dynamic registry fields; submit to /api/lead
  lib/
    cache.ts                   # In-memory TTL cache (Map)
    rateLimit.ts               # Small fixed-window per-IP rate limiter
    config.ts                  # Validation-related config/flags
    mailboxlayer.ts            # Email validation helper (timeout soft-pass, policy)
    numverify.ts               # Phone validation helper (timeout soft-pass, optional VOIP block)
    validate.ts                # Combined validator; normalization; caching; echo values
    leadconnector.ts           # LeadConnector client; required headers; detailed error surfacing
    formsRegistry.ts           # Registry accessors; resolves env-bound IDs (location/workflow)
    formsMap.ts                # Legacy/static mapping (superseded by registry.json; API still imports it)
    utm.ts                     # UTM helper (not wired into submit)
```

Notes:

- `formsMap.ts` is a legacy static mapping. The UI uses `forms/registry.json` via `formsRegistry.ts`. `/api/lead` currently imports `formsMap.ts`; consider switching it to `formsRegistry.ts` for full consistency.

## Runtime Architecture & Data Flow

```
[Browser]
  │
  │  blur (email/phone)
  ▼
[LeadForm.tsx]
  ├─ POST /api/validate { email? , phone?, country? }
  │    └─ validate.ts → mailboxlayer.ts / numverify.ts
  │         - in-memory cache (15m)
  │         - timeout → soft-pass
  │         - echoes { echoEmail, echoPhone }
  │
  └─ POST /api/lead { formSlug, contact fields, customFields }
       ├─ Revalidate via validate.ts (server-side)
       ├─ Upsert contact → leadconnector.ts → POST /contacts/
       └─ Optional enroll → POST /contacts/:id/workflow/:workflowId
```

Client-side UX:

- Validation on blur only. AbortController cancels in-flight requests; echo guards drop stale responses.
- Pending: spinner + gray “Validating…”. Valid: green check + green helper. Invalid: red border + red helper.
- Submit disabled when any validation is pending, email/phone invalid, or required name/consent missing.

## Environment Variables

LeadConnector (server-side only):

- `LC_BASE_URL` (required) – default `https://services.leadconnectorhq.com`; read in `src/lib/leadconnector.ts`.
- `LC_API_VERSION` (required) – default `2021-07-28`; read in `src/lib/leadconnector.ts`.
- `LC_PRIVATE_TOKEN` (required) – Bearer token; read in `src/lib/leadconnector.ts`.
- `LC_LOCATION_ID` (required via registry) – resolved in `src/lib/formsRegistry.ts` from `locationIdEnv`.
- `LC_WORKFLOW_ID` (optional via registry) – resolved similarly from `workflowIdEnv`.

**Note**: LeadConnector radio/select/checkbox custom fields require the exact option string. This code maps internal values to option labels before sending.

Validation providers:

- `MAILBOXLAYER_API_KEY` (optional; soft-pass if missing) – `src/lib/mailboxlayer.ts`.
- `NUMVERIFY_API_KEY` (optional; soft-pass if missing) – `src/lib/numverify.ts`.

Validation flags (`src/lib/config.ts`):

- `VALIDATION_SCORE_THRESHOLD` (default 0.65)
- `BLOCK_ROLE_EMAILS` (default true)
- `BLOCK_VOIP` (default false)
- `VALIDATION_TIMEOUT_MS` (default 5000)

Behavior when missing:

- Missing Mailboxlayer/Numverify keys → validators soft-pass on blur; submit still revalidates server-side.
- Missing LeadConnector envs → `/api/lead` returns 500 with `Missing env vars: ...`. LeadConnector 403/422/401 surface upstream `status`, `path`, and `details`.

## Form Registry

`src/app/forms/registry.json` defines forms:

- `slug`, `name`, `locationIdEnv`, `workflowIdEnv`
- `sections[]` each with `fields[]`
  - `map` – core fields rendered by `LeadForm.tsx`: `firstName`, `lastName`, `email`, `country`, `phone`, `consentTransactional`, `consentMarketing`
  - `mapCustomFieldId` – GHL contact custom field ID to write via `customFields[{id,value}]`

Add a new form:

1. Add an object to `forms[]` with a unique `slug` and env-bound IDs.
2. Ensure the referenced envs exist in `.env.local`.
3. Open `/forms/<slug>`.

## API Contracts

### POST /api/validate

Request (any subset):

```json
{ "email": "user@example.com", "phone": "+13055550123", "country": "US" }
```

Response:

```json
{
  "emailValid": true,
  "emailReason": "",
  "phoneValid": false,
  "phoneReason": "Number invalid",
  "echoEmail": "user@example.com",
  "echoPhone": "+13055550123"
}
```

Notes: rate-limited; heuristic `bad_format` for obviously bad emails; timeout → soft-pass.

### POST /api/lead

Request:

```json
{
  "formSlug": "form-testing-n8n",
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane@example.com",
  "phone": "+15555550123",
  "country": "US",
  "consentTransactional": true,
  "consentMarketing": false,
  "customFields": [
    { "id": "CF_FORM1_SYSTEM_SCOPE", "value": "complete_system" }
  ]
}
```

Success:

```json
{ "ok": true, "contactId": "abc123" }
```

Failure (example):

```json
{
  "ok": false,
  "message": "LeadConnector 403 Forbidden on /contacts/",
  "status": 403,
  "source": "lead",
  "details": { "message": "token not authorized for Location-Id" },
  "path": "/contacts/"
}
```

LeadConnector headers (see `leadconnector.ts`): Authorization, Version, Location-Id, Content-Type, Accept.

### reCAPTCHA v2 (checkbox)

Two switches to enable gating:

1. Per-form config (preferred): add `"captcha": true` to a form in `src/app/forms/registry.json` (e.g., `form-2-calendar-boilers`).
2. Per-env public list: set `NEXT_PUBLIC_RECAPTCHA_FOR_SLUGS` to a comma-separated list of slugs.

Client envs:

```
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=your_site_key_here
NEXT_PUBLIC_RECAPTCHA_FOR_SLUGS=form-2-calendar-boilers
```

Server envs:

```
RECAPTCHA_ENABLED=true
RECAPTCHA_SECRET=your_secret_here
```

Notes:

- Client uses only NEXT*PUBLIC*\* envs to decide whether to render the widget and gate Submit.
- Server uses `RECAPTCHA_ENABLED` and `RECAPTCHA_SECRET` to verify tokens and enforce gating in `/api/appointments`.
- Files:
  - `src/lib/env.ts` – env helpers; `isRecaptchaRequiredForSlug` checks form flag or public list
  - `src/lib/recaptcha.ts` – server verification util
  - `src/app/api/recaptcha/verify/route.ts` – optional diagnostic endpoint
  - `src/app/api/appointments/route.ts` – verifies token for gated slugs
  - `src/components/LeadForm.tsx` – renders widget above Submit and includes `captchaToken`

## Styling

- Tailwind integration:
  - `src/app/globals.css` imports Tailwind v4 preflight/utilities.
  - `tailwind.config.ts` includes app/src globs and `@tailwindcss/forms` plugin.
- Shared classes in `LeadForm.tsx`:
  - `INPUT_BASE` (inputs; pr-9 reserves space for spinner/check)
  - `BUTTON_BASE` (submit)
  - `inputStateClasses(valid,pending)` (blue/green/red borders and rings)
- Card/container layout in `forms/[slug]/page.tsx` uses `mx-auto max-w-2xl ... bg-white rounded-xl border shadow-sm p-6 sm:p-8`.

Troubleshooting styles not applying:

- Restart dev server after editing `tailwind.config.ts`.
- Ensure `layout.tsx` imports `./globals.css` and no other global CSS is imported after it.
- Verify form elements have Tailwind classes in DevTools.
- Remove/scoped any global CSS that targets `input, select, textarea`.

## Validation UX

- Blur-only validation: pending spinner + gray helper; green check + green helper on success; red border + helper on failure.
- AbortController + echo guards to avoid stale updates.
- Submit disabled unless: names filled, transactional consent checked, email/phone valid, and no validation pending.

## Local Dev & Scripts

From `package.json`:

- `npm run dev` – Next dev server
- `npm run build` – Production build
- `npm run start` – Start production server
- `npm run lint` – ESLint

Run locally:

1. Create `.env.local` with required variables (see Environment Variables).
2. `npm run dev`.
3. Visit `/forms/<slug>`.

## Deployment

- Deploy to Vercel or any Node-compatible host. Configure env vars server-side. Tokens/keys are used only in server code (`app/api/*`, `lib/*`).

## Security Notes

- Never expose `LC_PRIVATE_TOKEN` in client code. All LeadConnector calls happen server-side.
- Provider keys (Mailboxlayer/Numverify) are used server-side only.

## Testing / Manual QA Checklist

- Invalid → blur shows red helper and disables Submit; fixing then blur flips to green ✓.
- Rapid edits → stale validation responses are ignored.
- Simulated network failure → soft-pass on blur; submit revalidation enforces.
- LeadConnector 4xx/5xx → client alert shows message; console includes detailed JSON.
- Dynamic fields render and required rules apply; answers mapped to `customFields` are saved.
- Multiple slugs route correctly.

## Open Questions / TODOs

- `src/lib/formsMap.ts` vs `formsRegistry.ts`: UI uses registry; `/api/lead` still uses the legacy map. Recommend consolidation.
- `src/lib/utm.ts` exists but is not currently added to the submit payload.

---

### Discovered Form Slugs

From `src/app/forms/registry.json`:

- `form-testing-n8n`
- `form-1-calendar`
- `form-2-calendar-boilers`
- `form-3-calendar-fcu`
- `form-contact-us`
- `general-lead-form`
- `google-ads-lead-form`

### Red Flags

- Legacy `formsMap.ts` and dynamic `formsRegistry.ts` coexist; `/api/lead` still uses the legacy map. Recommend consolidation.
- Ensure all required envs are set in deployment: `LC_PRIVATE_TOKEN`, `LC_API_VERSION`, `LC_BASE_URL`, and registry-resolved `LC_LOCATION_ID`.
