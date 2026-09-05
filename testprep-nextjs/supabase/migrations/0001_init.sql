-- TestPrep Portal — Supabase schema
--
-- Replaces the FastAPI backend entirely. Supabase's built-in Auth
-- (auth.users) replaces the custom JWT + Fernet-encrypted password login;
-- every other store keeps the same "id + jsonb data" shape the FastAPI
-- generic_store.py used, so the frontend's dbGetAll/dbGet/dbPut/dbDelete
-- functions map onto plain PostgREST calls with almost no logic change.
--
-- Run this with `supabase db push`, or paste it into the Supabase
-- dashboard's SQL editor.

-- ---------------------------------------------------------------------------
-- Profiles — one row per auth.users row. Holds role/status, since
-- Supabase Auth itself doesn't have a "role" concept built in.
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  role text not null default 'user' check (role in ('admin', 'teacher', 'guide', 'user')),
  status text not null default 'active' check (status in ('active', 'blocked')),
  is_first_login boolean not null default true,
  force_password_change boolean not null default false,
  data jsonb not null default '{}'::jsonb, -- name, collegeId, seriesAssignCycle, etc.
  created_at timestamptz not null default now()
);

-- Auto-create a profile row whenever someone signs up via Supabase Auth.
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Helper: current user's role, used inside RLS policies below.
create or replace function current_role_name()
returns text language sql stable security definer as $$
  select role from profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Generic JSONB-backed stores (mirrors generic_store.py's STORE_CONFIGS)
-- ---------------------------------------------------------------------------
create table if not exists colleges (
  id serial primary key,
  data jsonb not null default '{}'::jsonb
);

create table if not exists site_settings (
  key text primary key,
  data jsonb not null default '{}'::jsonb
);

create table if not exists test_series (
  id serial primary key,
  data jsonb not null default '{}'::jsonb
);

create table if not exists tests (
  id serial primary key,
  series_id integer references test_series(id) on delete set null,
  is_demo boolean not null default false,
  deleted boolean not null default false,
  data jsonb not null default '{}'::jsonb  -- name, timeMinutes, defaultMarks, defaultNegativeMarks, price...
);

-- Questions include the answer key + solution — NEVER exposed to students
-- directly (see RLS below). The start-test Edge Function reads this table
-- with the service-role key and strips answer/solution before returning
-- questions to the browser.
create table if not exists questions (
  id serial primary key,
  test_id integer references tests(id) on delete cascade,
  data jsonb not null default '{}'::jsonb -- question, options, answer, solution, marks, negativeMarks, section...
);

create table if not exists video_courses (
  id serial primary key,
  data jsonb not null default '{}'::jsonb
);

create table if not exists videos (
  id serial primary key,
  course_id integer references video_courses(id) on delete cascade,
  data jsonb not null default '{}'::jsonb
);

create table if not exists materials (
  id serial primary key,
  series_id integer references test_series(id) on delete set null,
  data jsonb not null default '{}'::jsonb
);

create table if not exists guide_permissions (
  id serial primary key,
  data jsonb not null default '{}'::jsonb
);

create table if not exists subscriptions (
  id serial primary key,
  data jsonb not null default '{}'::jsonb
);

-- ---------------------------------------------------------------------------
-- Exam sessions — replaces the Redis-backed one-time session token from
-- exam.py. A row here is the authoritative "what did we show this
-- test-taker, and by when must they submit" record; only the Edge
-- Functions (service role) ever read or write it.
-- ---------------------------------------------------------------------------
create table if not exists exam_sessions (
  token uuid primary key default gen_random_uuid(),
  test_id integer not null references tests(id),
  user_id uuid references auth.users(id),
  user_email text not null,
  user_name text not null,
  is_guest boolean not null default false,
  question_ids integer[] not null,
  started_at_ms bigint not null,
  end_at_ms bigint not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Results
-- ---------------------------------------------------------------------------
create table if not exists results (
  id serial primary key,
  user_id uuid references auth.users(id),
  user_email text not null,
  test_id integer not null references tests(id),
  series_id integer,
  is_free_test boolean not null default false,
  score numeric not null,
  total_marks numeric not null,
  timestamp_ms bigint not null,
  data jsonb not null default '{}'::jsonb -- userName, testName, sectionStats, accuracy, etc.
);

create index if not exists idx_results_user_email on results(user_email);
create index if not exists idx_results_test_id on results(test_id);
create index if not exists idx_questions_test_id on questions(test_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;
alter table colleges enable row level security;
alter table site_settings enable row level security;
alter table test_series enable row level security;
alter table tests enable row level security;
alter table questions enable row level security;
alter table video_courses enable row level security;
alter table videos enable row level security;
alter table materials enable row level security;
alter table guide_permissions enable row level security;
alter table subscriptions enable row level security;
alter table exam_sessions enable row level security;
alter table results enable row level security;

-- profiles: everyone can read their own row; admins can read/update all.
create policy "read own profile" on profiles for select using (auth.uid() = id or current_role_name() = 'admin');
create policy "update own profile" on profiles for update using (auth.uid() = id or current_role_name() = 'admin');

-- Public-read stores (anyone, including logged-out visitors, via the anon key)
create policy "public read colleges" on colleges for select using (true);
create policy "public read site_settings" on site_settings for select using (true);
create policy "public read test_series" on test_series for select using (true);
create policy "public read tests" on tests for select using (true);
create policy "public read video_courses" on video_courses for select using (true);
create policy "public read videos" on videos for select using (true);

-- Staff-write on the above (admin/teacher, matching write_roles in stores.py)
create policy "staff write colleges" on colleges for all
  using (current_role_name() = 'admin') with check (current_role_name() = 'admin');
create policy "staff write site_settings" on site_settings for all
  using (current_role_name() = 'admin') with check (current_role_name() = 'admin');
create policy "staff write test_series" on test_series for all
  using (current_role_name() in ('admin','teacher')) with check (current_role_name() in ('admin','teacher'));
create policy "staff write tests" on tests for all
  using (current_role_name() in ('admin','teacher')) with check (current_role_name() in ('admin','teacher'));
create policy "staff write video_courses" on video_courses for all
  using (current_role_name() in ('admin','teacher')) with check (current_role_name() in ('admin','teacher'));
create policy "staff write videos" on videos for all
  using (current_role_name() in ('admin','teacher')) with check (current_role_name() in ('admin','teacher'));

-- questions: staff-only, both read AND write — students must NEVER be able
-- to select this table directly (that's the whole point of the sanitized
-- start-test Edge Function).
create policy "staff read questions" on questions for select
  using (current_role_name() in ('admin','teacher'));
create policy "staff write questions" on questions for all
  using (current_role_name() in ('admin','teacher')) with check (current_role_name() in ('admin','teacher'));

-- materials: readable by any authenticated role, written by staff
create policy "authenticated read materials" on materials for select using (auth.uid() is not null);
create policy "staff write materials" on materials for all
  using (current_role_name() in ('admin','teacher')) with check (current_role_name() in ('admin','teacher'));

-- guidePermissions: admin + guide can read, admin writes
create policy "admin guide read guide_permissions" on guide_permissions for select
  using (current_role_name() in ('admin','guide'));
create policy "admin write guide_permissions" on guide_permissions for all
  using (current_role_name() = 'admin') with check (current_role_name() = 'admin');

-- subscriptions: any authenticated role reads; admin/teacher/user writes
create policy "authenticated read subscriptions" on subscriptions for select using (auth.uid() is not null);
create policy "write subscriptions" on subscriptions for all
  using (current_role_name() in ('admin','teacher','user')) with check (current_role_name() in ('admin','teacher','user'));

-- exam_sessions: no direct client access at all — only the Edge Functions
-- (using the service-role key, which bypasses RLS) touch this table.
-- (No policies created = default-deny for anon/authenticated roles.)

-- results: a student can read their own; staff can read/delete all.
-- No direct INSERT policy for anon/authenticated — results are only ever
-- written by the submit-result Edge Function (service role), so a client
-- can never fabricate its own score.
create policy "read own results" on results for select
  using (auth.uid() = user_id or current_role_name() in ('admin','teacher'));
create policy "staff delete results" on results for delete
  using (current_role_name() in ('admin','teacher'));
