"use client";

import { useEffect, useState } from "react";
import { fetchLeaderboard, LeaderboardEntry } from "@/lib/api";

export default function LeaderboardPage() {
  const [rows, setRows] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeaderboard()
      .then(setRows)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-extrabold mb-6">Leaderboard</h1>

      {loading && <p className="text-slate-500">Loading…</p>}

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="p-3">#</th>
              <th className="p-3">Name</th>
              <th className="p-3">Test</th>
              <th className="p-3 text-right">Score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="p-3 font-bold text-slate-400">{i + 1}</td>
                <td className="p-3 font-semibold">{r.userName}</td>
                <td className="p-3 text-slate-500">{r.testName}</td>
                <td className="p-3 text-right font-bold text-blue-600">
                  {r.score}/{r.totalMarks}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && rows.length === 0 && (
          <p className="p-4 text-slate-500">No results yet.</p>
        )}
      </div>
    </div>
  );
}
