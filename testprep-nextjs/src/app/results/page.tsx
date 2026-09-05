"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listResults } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

interface ResultRow {
  id: number;
  testName?: string;
  score: number;
  totalMarks: number;
  accuracy?: string;
  timestamp?: string;
  attemptedCount?: number;
  correctCount?: number;
  wrongCount?: number;
}

export default function ResultsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    listResults<ResultRow>()
      .then(setRows)
      .finally(() => setLoading(false));
  }, [user]);

  if (authLoading || !user) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-extrabold mb-6">My results</h1>

      {loading && <p className="text-slate-500">Loading…</p>}
      {!loading && rows.length === 0 && (
        <p className="text-slate-500">No attempts yet — go take a test!</p>
      )}

      <div className="flex flex-col gap-3">
        {rows.map((r) => (
          <div
            key={r.id}
            className="bg-white border border-slate-200 rounded-lg shadow-sm p-4 flex items-center justify-between"
          >
            <div>
              <p className="font-bold">{r.testName || "Test"}</p>
              <p className="text-xs text-slate-400">{r.timestamp}</p>
            </div>
            <div className="text-right">
              <p className="font-extrabold text-blue-600">
                {r.score} / {r.totalMarks}
              </p>
              <p className="text-xs text-slate-500">
                Accuracy {r.accuracy ?? "-"}%
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
