// Thin API client for the TestPrep backend — now Supabase instead of the
// FastAPI service. Every function keeps the EXACT same name and signature
// as the FastAPI-backed version, so none of the pages built earlier
// (login, home, exam, results, admin, etc.) needed to change — only this
// file's internals changed.
//
// Env vars needed (Vercel project settings / .env.local):
//   NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
//   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>

import { supabase } from "./supabase";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// ---- Auth -------------------------------------------------------------

export interface CurrentUser {
  email: string;
  role: "admin" | "teacher" | "guide" | "user";
  status: string;
  isFirstLogin: boolean;
  forcePasswordChange: boolean;
  [key: string]: unknown;
}

async function profileToCurrentUser(userId: string, email: string): Promise<CurrentUser> {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (error || !profile) {
    throw new ApiError("Could not load user profile", 500);
  }
  return {
    email: profile.email,
    role: profile.role,
    status: profile.status,
    isFirstLogin: profile.is_first_login,
    forcePasswordChange: profile.force_password_change,
    ...(profile.data as Record<string, unknown>),
  };
}

export async function login(email: string, password: string): Promise<CurrentUser> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    throw new ApiError(error?.message || "Invalid login credentials!", 401);
  }
  const user = await profileToCurrentUser(data.user.id, data.user.email!);
  if (user.status === "blocked") {
    await supabase.auth.signOut();
    throw new ApiError("Your account is blocked by Administrator.", 403);
  }
  return user;
}

export async function fetchMe(): Promise<CurrentUser> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new ApiError("Session invalid", 401);
  return profileToCurrentUser(data.user.id, data.user.email!);
}

export async function changePassword(newPassword: string): Promise<CurrentUser> {
  if (newPassword.length < 4) {
    throw new ApiError("Password must be at least 4 characters long!", 400);
  }
  const { data: authData, error } = await supabase.auth.updateUser({ password: newPassword });
  if (error || !authData.user) throw new ApiError(error?.message || "Could not update password", 400);

  await supabase
    .from("profiles")
    .update({ is_first_login: false, force_password_change: false })
    .eq("id", authData.user.id);

  return profileToCurrentUser(authData.user.id, authData.user.email!);
}

export function logout() {
  void supabase.auth.signOut();
}

// ---- Generic JSONB-backed stores --------------------------------------
// Store name (as used throughout the app, matching the old backend's
// STORE_CONFIGS) -> Postgres table + promoted-column config.

interface ExtraColumn {
  sqlCol: string;   // real Postgres column name
  jsonKey: string;  // key exposed to the frontend
}

interface StoreConfig {
  table: string;
  idColumn: string;      // Postgres primary key column
  idIsString?: boolean;  // true for siteSettings (key is text, not serial)
  extraColumns?: ExtraColumn[];
}

const STORE_CONFIG: Record<string, StoreConfig> = {
  colleges: { table: "colleges", idColumn: "id" },
  siteSettings: { table: "site_settings", idColumn: "key", idIsString: true },
  testSeries: { table: "test_series", idColumn: "id" },
  tests: {
    table: "tests",
    idColumn: "id",
    extraColumns: [
      { sqlCol: "series_id", jsonKey: "seriesId" },
      { sqlCol: "is_demo", jsonKey: "isDemo" },
      { sqlCol: "deleted", jsonKey: "deleted" },
    ],
  },
  questions: {
    table: "questions",
    idColumn: "id",
    extraColumns: [{ sqlCol: "test_id", jsonKey: "testId" }],
  },
  videoCourses: { table: "video_courses", idColumn: "id" },
  videos: {
    table: "videos",
    idColumn: "id",
    extraColumns: [{ sqlCol: "course_id", jsonKey: "courseId" }],
  },
  materials: {
    table: "materials",
    idColumn: "id",
    extraColumns: [{ sqlCol: "series_id", jsonKey: "seriesId" }],
  },
  guidePermissions: { table: "guide_permissions", idColumn: "id" },
  subscriptions: { table: "subscriptions", idColumn: "id" },
};

function rowToObject(cfg: StoreConfig, row: Record<string, unknown>) {
  const out: Record<string, unknown> = {
    ...(row.data as Record<string, unknown>),
    id: row[cfg.idColumn],
  };
  for (const ec of cfg.extraColumns || []) out[ec.jsonKey] = row[ec.sqlCol];
  return out;
}

function objectToRow(cfg: StoreConfig, item: Record<string, unknown>) {
  const data: Record<string, unknown> = { ...item };
  delete data.id;
  const row: Record<string, unknown> = { data };
  for (const ec of cfg.extraColumns || []) {
    if (ec.jsonKey in item) {
      row[ec.sqlCol] = item[ec.jsonKey];
      delete data[ec.jsonKey];
    }
  }
  return row;
}

function requireConfig(store: string): StoreConfig {
  const cfg = STORE_CONFIG[store];
  if (!cfg) throw new ApiError(`Unknown store "${store}"`, 400);
  return cfg;
}

export async function dbGetAll<T = Record<string, unknown>>(store: string): Promise<T[]> {
  const cfg = requireConfig(store);
  const { data, error } = await supabase.from(cfg.table).select("*");
  if (error) throw new ApiError(error.message, 400);
  return (data || []).map((row) => rowToObject(cfg, row)) as T[];
}

export async function dbGet<T = Record<string, unknown>>(
  store: string,
  id: number | string
): Promise<T> {
  const cfg = requireConfig(store);
  const { data, error } = await supabase
    .from(cfg.table)
    .select("*")
    .eq(cfg.idColumn, id)
    .single();
  if (error || !data) throw new ApiError("Not found", 404);
  return rowToObject(cfg, data) as T;
}

export async function dbPut<T = Record<string, unknown>>(
  store: string,
  item: Record<string, unknown>
): Promise<T> {
  const cfg = requireConfig(store);
  const row = objectToRow(cfg, item);

  if (item.id !== undefined && item.id !== null && item.id !== "") {
    const { data, error } = await supabase
      .from(cfg.table)
      .update(row)
      .eq(cfg.idColumn, item.id)
      .select()
      .single();
    if (error || !data) throw new ApiError(error?.message || "Update failed", 400);
    return rowToObject(cfg, data) as T;
  }

  const { data, error } = await supabase.from(cfg.table).insert(row).select().single();
  if (error || !data) throw new ApiError(error?.message || "Create failed", 400);
  return rowToObject(cfg, data) as T;
}

export async function dbDelete(store: string, id: number | string): Promise<void> {
  const cfg = requireConfig(store);
  const { error } = await supabase.from(cfg.table).delete().eq(cfg.idColumn, id);
  if (error) throw new ApiError(error.message, 400);
}

// ---- Exam flow — calls the start-test / submit-result Edge Functions ---
// (Both stay server-side: Postgres RLS blocks students from reading
// `questions` directly, and blocks direct INSERT into `results`, so this
// is the only path in or out of an exam attempt.)

export interface StartedTest {
  sessionToken: string;
  serverEndTimeMs: number;
  test: Record<string, unknown> & { id: number; name?: string; timeMinutes?: number };
  questions: Array<Record<string, unknown> & { id: number }>;
}

export async function startTest(
  testId: number,
  guest?: { name: string; email: string }
): Promise<StartedTest> {
  const { data, error } = await supabase.functions.invoke<StartedTest & { error?: string }>(
    "start-test",
    { body: { testId, guestName: guest?.name, guestEmail: guest?.email } }
  );
  if (error || !data || "error" in data && data.error) {
    throw new ApiError((data as { error?: string } | null)?.error || error?.message || "Could not start test", 400);
  }
  return data as StartedTest;
}

export interface SubmitResultResponse {
  result: Record<string, unknown>;
  questions: Array<Record<string, unknown>>;
}

export async function submitResult(
  sessionToken: string,
  answers: Array<number | null>
): Promise<SubmitResultResponse> {
  const { data, error } = await supabase.functions.invoke<SubmitResultResponse & { error?: string }>(
    "submit-result",
    { body: { sessionToken, answers } }
  );
  if (error || !data || ("error" in data && data.error)) {
    throw new ApiError((data as { error?: string } | null)?.error || error?.message || "Could not submit test", 400);
  }
  return data as SubmitResultResponse;
}

export async function listResults<T = Record<string, unknown>>(): Promise<T[]> {
  const { data, error } = await supabase.from("results").select("*");
  if (error) throw new ApiError(error.message, 400);
  return (data || []).map((row) => ({
    id: row.id,
    userEmail: row.user_email,
    testId: row.test_id,
    seriesId: row.series_id,
    isFreeTest: row.is_free_test,
    score: Number(row.score),
    totalMarks: Number(row.total_marks),
    timestampMs: row.timestamp_ms,
    ...(row.data as Record<string, unknown>),
  })) as T[];
}

export async function deleteResult(id: number): Promise<void> {
  const { error } = await supabase.from("results").delete().eq("id", id);
  if (error) throw new ApiError(error.message, 400);
}

export interface LeaderboardEntry {
  userName: string;
  testName: string;
  score: number;
  totalMarks: number;
}

export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase
    .from("results")
    .select("data, score, total_marks")
    .order("score", { ascending: false })
    .limit(100);
  if (error) throw new ApiError(error.message, 400);
  return (data || []).map((row) => ({
    userName: (row.data as Record<string, unknown>)?.userName as string,
    testName: (row.data as Record<string, unknown>)?.testName as string,
    score: Number(row.score),
    totalMarks: Number(row.total_marks),
  }));
}
