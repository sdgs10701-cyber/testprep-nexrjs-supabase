"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { dbGetAll } from "@/lib/api";

interface TestSeries {
  id: number;
  name?: string;
  description?: string;
  price?: number;
}

interface Test {
  id: number;
  seriesId?: number;
  name?: string;
  timeMinutes?: number;
  isDemo?: boolean;
  deleted?: boolean;
}

export default function HomePage() {
  const [series, setSeries] = useState<TestSeries[]>([]);
  const [tests, setTests] = useState<Test[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([dbGetAll<TestSeries>("testSeries"), dbGetAll<Test>("tests")])
      .then(([s, t]) => {
        setSeries(s);
        setTests(t.filter((x) => !x.deleted));
      })
      .catch((err) => setError(err?.message || "Could not reach Supabase."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="bg-gradient-to-br from-blue-900 to-blue-600 text-white text-center py-14 px-4">
        <h1 className="text-3xl sm:text-4xl font-extrabold mb-3">
          TestPrep Portal
        </h1>
        <p className="max-w-2xl mx-auto opacity-90">
          Practice tests, mock exams, and study material — all in one place.
        </p>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {loading && <p className="text-slate-500">Loading test series…</p>}
        {error && (
          <p className="text-red-600 bg-red-50 border border-red-200 rounded-md px-4 py-3">
            {error}
            <br />
            Check that <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> are set correctly and
            that the deployment was rebuilt after setting them.
          </p>
        )}

        {!loading && !error && series.length === 0 && (
          <p className="text-slate-500">No test series published yet.</p>
        )}

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {series.map((s) => {
            const seriesTests = tests.filter((t) => t.seriesId === s.id);
            return (
              <div
                key={s.id}
                className="bg-white border border-slate-200 rounded-lg shadow-sm p-5 flex flex-col justify-between"
              >
                <div>
                  <h2 className="font-bold text-lg mb-1">
                    {s.name || `Series #${s.id}`}
                  </h2>
                  {s.description && (
                    <p className="text-sm text-slate-500 mb-3">
                      {s.description}
                    </p>
                  )}
                  <ul className="flex flex-col gap-2 mb-4">
                    {seriesTests.map((t) => (
                      <li
                        key={t.id}
                        className="flex items-center justify-between text-sm border border-slate-200 rounded-md px-3 py-2"
                      >
                        <span>
                          {t.name || `Test #${t.id}`}
                          {t.isDemo && (
                            <span className="ml-2 text-xs font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded">
                              FREE
                            </span>
                          )}
                        </span>
                        <Link
                          href={`/exam/${t.id}`}
                          className="text-blue-600 font-semibold hover:underline"
                        >
                          Start →
                        </Link>
                      </li>
                    ))}
                    {seriesTests.length === 0 && (
                      <li className="text-sm text-slate-400">
                        No tests added to this series yet.
                      </li>
                    )}
                  </ul>
                </div>
                {s.price !== undefined && (
                  <div className="text-sm font-bold text-amber-700 bg-amber-100 border border-amber-200 rounded px-2 py-1 self-start">
                    ₹{s.price}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
