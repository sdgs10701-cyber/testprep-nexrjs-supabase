# TestPrep Portal — Next.js + Supabase

A React/Next.js rewrite of `clg13_fullstack.html`, now backed by
**Supabase** (Postgres + Auth + Edge Functions) instead of the earlier
FastAPI/Postgres/Redis stack. No separate backend to host — Supabase
*is* the backend.

## Architecture

| Concern | How it's handled |
|---|---|
| Auth (login, sessions, password) | Supabase Auth (`auth.users`) |
| Roles (admin/teacher/guide/user), status | `profiles` table, 1 row per user |
| Colleges, test series, tests, videos, materials, etc. | Plain Postgres tables + Row Level Security (RLS) — read via PostgREST, no custom API needed |
| Starting a test (hide answers, shuffle, timer) | **Edge Function** `start-test` — uses the service-role key to read the real question bank (which RLS blocks students from reading directly), strips `answer`/`solution`, stores the authoritative order + end-time in `exam_sessions` |
| Submitting a test (scoring) | **Edge Function** `submit-result` — re-scores server-side from the session's real answer key, one-time use (deletes the session), so the client can never fabricate its own score |

This keeps the same two security properties the FastAPI backend had:
students never see answers while testing, and scores are always computed
server-side — Postgres RLS + Edge Functions do the job Redis + FastAPI
did before.

## One-time setup

### 1. Create a Supabase project
[supabase.com/dashboard](https://supabase.com/dashboard) → New Project.

### 2. Run the schema
In the dashboard → **SQL Editor**, paste and run
`supabase/migrations/0001_init.sql` (or, with the Supabase CLI:
`supabase link --project-ref <ref>` then `supabase db push`).

This creates all tables, the `profiles` auto-provisioning trigger, and
every RLS policy described above.

### 3. Deploy the two Edge Functions
```bash
npm install -g supabase   # if you don't have the CLI
supabase login
supabase link --project-ref <your-project-ref>
supabase functions deploy start-test
supabase functions deploy submit-result
```
Both functions read `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` — the
Supabase CLI injects these automatically at deploy time, you don't set
them yourself.

### 4. Create your first admin user
Sign up once through the app's login page's flow (or **Authentication →
Add user** in the dashboard) — a `profiles` row is auto-created with
`role = 'user'`. Then in the SQL Editor:
```sql
update profiles set role = 'admin' where email = 'you@example.com';
```

### 5. Seed some data (optional)
Insert directly via SQL Editor, e.g.:
```sql
insert into test_series (data) values ('{"name": "SSC CGL Mock Series", "price": 0}');
insert into tests (series_id, is_demo, data)
  values (1, true, '{"name": "Free Mock Test 1", "timeMinutes": 30}');
insert into questions (test_id, data) values
  (1, '{"question": "2 + 2 = ?", "options": ["3","4","5","6"], "answer": 1, "marks": 1, "negativeMarks": 0.25}');
```

## Local development

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project URL + anon key
npm run dev
```

## Deploying to Vercel

1. Push this repo to GitHub.
2. Vercel → **Add New → Project** → import the repo.
3. Add environment variables:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
   ```
4. Deploy. Framework preset "Next.js" is auto-detected.

No CORS setup needed — Supabase's API and Edge Functions already accept
requests from any origin using the anon key; access control is entirely
via RLS + the Edge Functions, not CORS.

## What's included (working end-to-end)

- Login / logout / forced password change on first login (Supabase Auth)
- Public home page listing test series + tests
- Full exam-taking flow via the two Edge Functions above
- My Results page, public leaderboard
- Generic admin CRUD screen (`/admin/<store>`) for every table

## What's NOT ported yet (follow-up work)

Same gaps as the FastAPI version — a dedicated question-bank editor UI,
admin user-management UI (the `profiles` table + Supabase Admin API can
support this, no Edge Function needed since Supabase Auth already has
invite/reset-password endpoints), video/lesson player UI, PDF export,
ticker notifications. These are additive UI work on top of what's here.

## Note on `dbGetAll`/`dbPut`/etc.

`src/lib/api.ts` keeps the exact same function names/signatures as the
FastAPI-backed version did — only the internals changed (now querying
Supabase tables directly, with camelCase↔snake_case translation handled
in one place). That's why none of the page components had to change when
switching backends.
