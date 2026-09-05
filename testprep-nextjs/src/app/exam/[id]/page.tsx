"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  startTest,
  submitResult,
  StartedTest,
  SubmitResultResponse,
  ApiError,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

type Question = StartedTest["questions"][number];

export default function ExamPage() {
  const params = useParams<{ id: string }>();
  const testId = Number(params.id);
  const { user } = useAuth();

  const [session, setSession] = useState<StartedTest | null>(null);
  const [answers, setAnswers] = useState<Record<number, number | null>>({});
  const [current, setCurrent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [remainingMs, setRemainingMs] = useState<number>(0);
  const [result, setResult] = useState<SubmitResultResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    startTest(testId, user ? undefined : { name: "Guest User", email: "guest@example.com" })
      .then((data) => {
        if (cancelled) return;
        setSession(data);
        setRemainingMs(Math.max(0, data.serverEndTimeMs - Date.now()));
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Could not start the test")
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testId]);

  const handleSubmit = useCallback(async () => {
    if (!session || submitting) return;
    setSubmitting(true);
    const answerArray = session.questions.map((q) => answers[q.id] ?? null);
    try {
      const res = await submitResult(session.sessionToken, answerArray);
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not submit the test");
    } finally {
      setSubmitting(false);
    }
  }, [session, answers, submitting]);

  // Timer tick
  useEffect(() => {
    if (!session || result) return;
    const interval = setInterval(() => {
      setRemainingMs((prev) => {
        const next = Math.max(0, session.serverEndTimeMs - Date.now());
        if (next <= 0) {
          clearInterval(interval);
          handleSubmit();
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [session, result, handleSubmit]);

  const minutes = Math.floor(remainingMs / 60000);
  const seconds = Math.floor((remainingMs % 60000) / 1000);

  const question: Question | undefined = session?.questions[current];

  const answeredCount = useMemo(
    () => Object.values(answers).filter((v) => v !== null && v !== undefined).length,
    [answers]
  );

  if (loading) return <p className="text-center mt-12 text-slate-500">Loading test…</p>;

  if (error && !session) {
    return (
      <p className="max-w-lg mx-auto mt-12 text-center text-red-600 bg-red-50 border border-red-200 rounded-md px-4 py-3">
        {error}
      </p>
    );
  }

  if (result) {
    const r = result.result as Record<string, unknown>;
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 text-center mb-6">
          <h1 className="text-2xl font-extrabold mb-1">Test submitted</h1>
          <p className="text-slate-500 mb-4">{String(r.testName ?? "")}</p>
          <div className="text-4xl font-extrabold text-blue-600">
            {String(r.score)} / {String(r.totalMarks)}
          </div>
          <div className="flex justify-center gap-6 mt-4 text-sm text-slate-500">
            <span>Attempted: {String(r.attemptedCount)}</span>
            <span>Correct: {String(r.correctCount)}</span>
            <span>Wrong: {String(r.wrongCount)}</span>
            <span>Accuracy: {String(r.accuracy)}%</span>
          </div>
        </div>

        <h2 className="font-bold mb-3">Answer review</h2>
        <div className="flex flex-col gap-3">
          {result.questions.map((q, idx) => {
            const isCorrect = q.isCorrect as boolean;
            return (
              <div
                key={idx}
                className={`border rounded-md p-4 ${
                  isCorrect
                    ? "border-green-200 bg-green-50"
                    : q.userAnswer === null || q.userAnswer === undefined
                    ? "border-slate-200 bg-white"
                    : "border-red-200 bg-red-50"
                }`}
              >
                <p className="font-semibold mb-2">
                  {idx + 1}. {String(q.question ?? q.text ?? "")}
                </p>
                {Array.isArray(q.options) &&
                  (q.options as string[]).map((opt, i) => (
                    <p
                      key={i}
                      className={`text-sm px-2 py-1 rounded ${
                        i === q.answer
                          ? "font-bold text-green-700"
                          : i === q.userAnswer
                          ? "text-red-700"
                          : "text-slate-600"
                      }`}
                    >
                      {opt}
                    </p>
                  ))}
                {typeof q.solution === "string" && q.solution && (
                  <p className="mt-2 text-sm text-slate-600 bg-white border border-slate-200 rounded p-2 whitespace-pre-wrap">
                    {q.solution}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (!session || !question) return null;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 grid gap-6 lg:grid-cols-[1fr_260px]">
      <div>
        <div className="flex items-center justify-between mb-4">
          <h1 className="font-bold text-lg">{session.test.name || "Test"}</h1>
          <span className="bg-amber-100 text-amber-800 border border-amber-200 rounded-full px-3 py-1 text-sm font-bold">
            {minutes}:{seconds.toString().padStart(2, "0")}
          </span>
        </div>

        {error && (
          <p className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-5">
          <p className="text-xs font-bold text-slate-400 mb-2">
            Question {current + 1} of {session.questions.length}
          </p>
          <p className="font-semibold mb-4 whitespace-pre-wrap">
            {String(question.question ?? question.text ?? "")}
          </p>

          <div className="flex flex-col gap-2">
            {Array.isArray(question.options) &&
              (question.options as string[]).map((opt, i) => (
                <button
                  key={i}
                  onClick={() =>
                    setAnswers((prev) => ({ ...prev, [question.id]: i }))
                  }
                  className={`text-left border rounded-md px-3 py-2 text-sm whitespace-pre-wrap ${
                    answers[question.id] === i
                      ? "border-blue-500 bg-blue-50 font-semibold"
                      : "border-slate-300 bg-white hover:border-blue-300"
                  }`}
                >
                  {opt}
                </button>
              ))}
          </div>

          <div className="flex justify-between mt-6">
            <button
              onClick={() => setCurrent((c) => Math.max(0, c - 1))}
              disabled={current === 0}
              className="px-4 py-2 rounded-md bg-slate-200 text-sm font-semibold disabled:opacity-50"
            >
              Previous
            </button>
            {current < session.questions.length - 1 ? (
              <button
                onClick={() =>
                  setCurrent((c) => Math.min(session.questions.length - 1, c + 1))
                }
                className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-semibold"
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-4 py-2 rounded-md bg-green-600 text-white text-sm font-semibold disabled:opacity-60"
              >
                {submitting ? "Submitting…" : "Submit test"}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4 h-fit">
        <p className="text-sm font-bold mb-3">
          Answered {answeredCount}/{session.questions.length}
        </p>
        <div className="grid grid-cols-5 gap-2">
          {session.questions.map((q, idx) => (
            <button
              key={q.id}
              onClick={() => setCurrent(idx)}
              className={`aspect-square rounded-md text-sm font-bold border ${
                idx === current
                  ? "border-2 border-blue-600"
                  : answers[q.id] !== undefined && answers[q.id] !== null
                  ? "bg-green-600 text-white border-green-600"
                  : "bg-slate-100 border-slate-200"
              }`}
            >
              {idx + 1}
            </button>
          ))}
        </div>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="mt-4 w-full py-2 rounded-md bg-green-600 text-white text-sm font-semibold disabled:opacity-60"
        >
          {submitting ? "Submitting…" : "Submit test"}
        </button>
      </div>
    </div>
  );
}
