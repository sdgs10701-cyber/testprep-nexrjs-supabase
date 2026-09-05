"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return <p className="text-center mt-12 text-slate-500">Loading…</p>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="text-2xl font-extrabold mb-1">Welcome back</h1>
      <p className="text-slate-500 mb-8">{user.email}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/"
          className="bg-white border border-slate-200 rounded-lg shadow-sm p-5 hover:border-blue-400"
        >
          <h2 className="font-bold mb-1">Browse test series</h2>
          <p className="text-sm text-slate-500">
            Find a test and start practicing.
          </p>
        </Link>

        <Link
          href="/results"
          className="bg-white border border-slate-200 rounded-lg shadow-sm p-5 hover:border-blue-400"
        >
          <h2 className="font-bold mb-1">My results</h2>
          <p className="text-sm text-slate-500">
            Review your past attempts and scores.
          </p>
        </Link>

        <Link
          href="/leaderboard"
          className="bg-white border border-slate-200 rounded-lg shadow-sm p-5 hover:border-blue-400"
        >
          <h2 className="font-bold mb-1">Leaderboard</h2>
          <p className="text-sm text-slate-500">See how you rank.</p>
        </Link>

        {["admin", "teacher"].includes(user.role) && (
          <Link
            href="/admin"
            className="bg-white border border-slate-200 rounded-lg shadow-sm p-5 hover:border-blue-400"
          >
            <h2 className="font-bold mb-1">Admin panel</h2>
            <p className="text-sm text-slate-500">
              Manage colleges, series, tests, videos, and materials.
            </p>
          </Link>
        )}
      </div>
    </div>
  );
}
