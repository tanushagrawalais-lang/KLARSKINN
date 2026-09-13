# KLARSINN

Premium AI learning companion: upload academic material, wait until the system has a versioned, page-grounded understanding of it, then request a personalized explanation.

This repository is on **Phase 5** (companion UI wired to existing APIs).

Architecture: [ARCHITECTURE.md](./ARCHITECTURE.md)

## Run locally

Requirements:

- Node.js 22+
- PostgreSQL

```bash
cp .env.example .env
# set AUTH_SECRET, DATABASE_URL, DIRECT_URL
# set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and GEMINI_API_KEY
npm install
npx prisma migrate dev
npm run dev
```

The app listens on [http://127.0.0.1:43147](http://127.0.0.1:43147).

Demo flow in the UI:

1. Create an account or sign in (`/sign-up`, `/sign-in`)
2. Complete the learning profile (`/onboarding`)
3. Upload a PDF in the companion (`/companion`)
4. Wait until understanding is `READY`
5. Choose an intent (or write a custom request)
6. Read the personalized explanation with source page references

Upload limits match the backend: PDF only, 20 MB max, 50 pages max.

## Phase 5 contents

- Stitch-style editorial UI for the demo flow above
- Real calls to existing auth, profile, document, intent, and explanation APIs
- Processing is polled from `GET /api/documents/:id` (no simulated upload)
- `stitch-export.html` in this repo was empty, so the visual system is reconstructed from KLARSINN product copy and a Stitch-like paper/forest/gold treatment

## Phase 4 contents

- `generateIntentOptions()` and `generateExplanation()` on `GeminiProvider`
- Explanations persist claims tagged supported / explanatory addition / analogy
- Owner-scoped intent-options and explanation APIs

## Phase 3 contents

- `GeminiProvider` behind `AIProvider.analyzeDocument()`
- Background processing of owned PDFs retrieved from storage
- Versioned `DocumentUnderstanding` with page-grounded concepts

## Phase 2 contents

- `StorageProvider` implemented with Supabase Storage (`study-materials`)
- Authenticated PDF upload with size and page limits
- Document metadata in PostgreSQL (`UPLOADED` / `VALIDATING` / `FAILED`)
- Owner-scoped list, get, and delete APIs

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Next.js dev server on port 43147 |
| `npm run typecheck` | Strict `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest |
| `npx prisma migrate dev` | Apply schema migrations locally |
| `npx prisma generate` | Generate Prisma Client |

## Phase 1 contents

- Email/password registration and login
- Argon2id password hashing
- Database-backed httpOnly sessions
- Learner profile API and completion gate
- Sign-up, sign-in, and onboarding routes
