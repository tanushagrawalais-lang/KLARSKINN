# KLARSINN

Premium AI learning companion: upload academic material, wait until the system has a versioned, page-grounded understanding of it, then request a personalized explanation.

This repository is on **Phase 2** (authenticated PDF upload to private Supabase Storage). Gemini, document understanding, and explanations are not implemented yet.

Architecture: [ARCHITECTURE.md](./ARCHITECTURE.md)

## Run locally

Requirements:

- Node.js 22+
- PostgreSQL

```bash
cp .env.example .env
# set AUTH_SECRET, DATABASE_URL, DIRECT_URL
# set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for PDF storage
npm install
npx prisma migrate dev
npm run dev
```

The app listens on [http://127.0.0.1:43147](http://127.0.0.1:43147).

- Health: `GET /api/health`
- Register: `/sign-up` or `POST /api/auth/register`
- Sign in: `/sign-in` or `POST /api/auth/sign-in`
- Profile questionnaire: `/onboarding`
- PDF upload: `POST /api/documents` (completed profile required)

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
- Minimal sign-up, sign-in, and onboarding route shells
