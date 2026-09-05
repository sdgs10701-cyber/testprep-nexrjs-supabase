// supabase/functions/submit-result/index.ts
//
// Deploy with: supabase functions deploy submit-result
//
// Mirrors backend/app/routers/exam.py's submit_result(): the client's own
// arithmetic is never trusted. This function loads the exam_sessions row
// created by start-test (proving which questions were actually shown and
// in what order), re-fetches the real answer key with the service role
// key, computes the score itself, deletes the session (one-time use —
// blocks resubmission/replay), and inserts the result row.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface QuestionData {
  question?: string;
  options?: string[];
  answer?: number;
  solution?: string;
  marks?: number;
  negativeMarks?: number;
  section?: string;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { sessionToken, answers } = await req.json();
    if (!sessionToken) return json({ error: "sessionToken is required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: session, error: sessErr } = await admin
      .from("exam_sessions")
      .select("*")
      .eq("token", sessionToken)
      .single();
    if (sessErr || !session) {
      return json({ error: "Exam session expired or already submitted. Please retake." }, 410);
    }

    const GRACE_MS = 5 * 60 * 1000;
    if (Date.now() > session.end_at_ms + GRACE_MS) {
      await admin.from("exam_sessions").delete().eq("token", sessionToken);
      return json({ error: "Exam session expired or already submitted. Please retake." }, 410);
    }

    // One-time use: delete immediately so a replayed request can't re-score.
    await admin.from("exam_sessions").delete().eq("token", sessionToken);

    const { data: test } = await admin
      .from("tests")
      .select("*")
      .eq("id", session.test_id)
      .single();
    if (!test) return json({ error: "Test no longer exists" }, 404);

    const { data: questionRows } = await admin
      .from("questions")
      .select("*")
      .in("id", session.question_ids);
    const byId = new Map((questionRows || []).map((q) => [q.id, q]));
    const orderedQuestions = (session.question_ids as number[])
      .map((id) => byId.get(id))
      .filter(Boolean) as Array<{ id: number; data: QuestionData }>;

    const testData = test.data as Record<string, unknown>;
    const ansArr: Array<number | null> = answers || [];

    let totalScore = 0;
    let maxMarks = 0;
    let attempted = 0;
    let correct = 0;
    let wrong = 0;
    const sectionMap = new Map<string, {
      section: string; obtained: number; max: number;
      totalQuestions: number; attempted: number; correct: number; wrong: number;
    }>();
    const review: Array<Record<string, unknown>> = [];

    orderedQuestions.forEach((q, idx) => {
      const qd = q.data;
      const pos = Number(qd.marks ?? testData.defaultMarks ?? 1) || 0;
      const neg = Number(qd.negativeMarks ?? testData.defaultNegativeMarks ?? 0) || 0;
      maxMarks += pos;
      const sectionName = qd.section || "Section 1";
      if (!sectionMap.has(sectionName)) {
        sectionMap.set(sectionName, {
          section: sectionName, obtained: 0, max: 0,
          totalQuestions: 0, attempted: 0, correct: 0, wrong: 0,
        });
      }
      const sec = sectionMap.get(sectionName)!;
      sec.max += pos;
      sec.totalQuestions += 1;

      const choice = idx < ansArr.length ? ansArr[idx] : null;
      const isCorrect = choice !== null && choice === qd.answer;
      if (choice !== null && choice !== undefined) {
        attempted += 1;
        sec.attempted += 1;
        if (isCorrect) {
          totalScore += pos;
          correct += 1;
          sec.obtained += pos;
          sec.correct += 1;
        } else {
          totalScore -= neg;
          wrong += 1;
          sec.obtained -= neg;
          sec.wrong += 1;
        }
      }

      review.push({ ...qd, id: q.id, userAnswer: choice, isCorrect });
    });

    totalScore = Math.round(totalScore * 100) / 100;
    const accuracy = attempted ? Math.round((correct / attempted) * 1000) / 10 : 0;
    const isFree = Boolean(test.is_demo) || Boolean(session.is_guest);
    const nowMs = Date.now();

    const { data: resultRow, error: insertErr } = await admin
      .from("results")
      .insert({
        user_id: session.user_id,
        user_email: session.user_email,
        test_id: test.id,
        series_id: test.series_id,
        is_free_test: isFree,
        score: totalScore,
        total_marks: maxMarks,
        timestamp_ms: nowMs,
        data: {
          userName: session.user_name,
          testName: testData.name,
          totalQuestions: orderedQuestions.length,
          attemptedCount: attempted,
          correctCount: correct,
          wrongCount: wrong,
          accuracy: String(accuracy),
          sectionStats: Array.from(sectionMap.values()).map((s) => ({
            ...s,
            obtained: Math.round(s.obtained * 100) / 100,
          })),
          timestamp: new Date(nowMs).toLocaleString(),
        },
      })
      .select()
      .single();

    if (insertErr || !resultRow) {
      return json({ error: "Could not save result." }, 500);
    }

    return json({
      result: {
        id: resultRow.id,
        userEmail: session.user_email,
        userName: session.user_name,
        testId: test.id,
        testName: testData.name,
        seriesId: test.series_id,
        score: totalScore,
        totalMarks: maxMarks,
        totalQuestions: orderedQuestions.length,
        attemptedCount: attempted,
        correctCount: correct,
        wrongCount: wrong,
        accuracy: String(accuracy),
        isFreeTest: isFree,
        timestampMs: nowMs,
      },
      questions: review,
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
