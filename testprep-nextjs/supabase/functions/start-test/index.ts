// supabase/functions/start-test/index.ts
//
// Deploy with: supabase functions deploy start-test
//
// Mirrors backend/app/routers/exam.py's start_test(): the browser must
// never receive the answer key while a test is in progress, so this
// function uses the SERVICE ROLE key (bypasses RLS, including the
// staff-only RLS on `questions`) to read the real questions, shuffles
// them, strips `answer`/`solution`, and stores the authoritative
// question order + a server-side end time in `exam_sessions`. The
// browser only ever gets back the sanitized questions + a session token.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { testId, guestName, guestEmail } = await req.json();
    if (!testId) {
      return json({ error: "testId is required" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Identify the caller (if logged in) from the incoming Authorization
    // header, so we can attribute the attempt to a real user when present.
    let userId: string | null = null;
    let userEmail = guestEmail || "guest@example.com";
    let userName = guestName || "Guest User";
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: userData } = await admin.auth.getUser(token);
      if (userData?.user) {
        userId = userData.user.id;
        userEmail = userData.user.email ?? userEmail;
        const { data: profile } = await admin
          .from("profiles")
          .select("data")
          .eq("id", userId)
          .single();
        userName = (profile?.data as Record<string, unknown>)?.name as string || userEmail;
      }
    }

    const { data: test, error: testErr } = await admin
      .from("tests")
      .select("*")
      .eq("id", testId)
      .eq("deleted", false)
      .single();
    if (testErr || !test) {
      return json({ error: "This test is no longer available." }, 404);
    }

    const { data: questions, error: qErr } = await admin
      .from("questions")
      .select("*")
      .eq("test_id", testId);
    if (qErr || !questions || questions.length === 0) {
      return json({ error: "No questions added to this test module yet." }, 400);
    }

    // Server-side shuffle (Fisher-Yates)
    const shuffled = [...questions];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const timeMinutes = (test.data as Record<string, unknown>)?.timeMinutes as number || 15;
    const nowMs = Date.now();
    const endMs = nowMs + timeMinutes * 60_000;

    const { data: session, error: sessErr } = await admin
      .from("exam_sessions")
      .insert({
        test_id: testId,
        user_id: userId,
        user_email: userEmail,
        user_name: userName,
        is_guest: userId === null,
        question_ids: shuffled.map((q) => q.id),
        started_at_ms: nowMs,
        end_at_ms: endMs,
      })
      .select()
      .single();
    if (sessErr || !session) {
      return json({ error: "Could not start exam session." }, 500);
    }

    const sanitized = shuffled.map((q) => {
      const d = { ...(q.data as Record<string, unknown>) };
      delete d.answer;
      delete d.solution;
      return { ...d, id: q.id };
    });

    return json({
      sessionToken: session.token,
      serverEndTimeMs: endMs,
      test: { ...(test.data as Record<string, unknown>), id: test.id },
      questions: sanitized,
    });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}
