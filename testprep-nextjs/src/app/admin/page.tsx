"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

const STORES = [
  { key: "colleges", label: "Colleges" },
  { key: "testSeries", label: "Test Series" },
  { key: "tests", label: "Tests" },
  { key: "videoCourses", label: "Video Courses" },
  { key: "videos", label: "Videos" },
  { key: "materials", label: "Study Materials" },
  { key: "subscriptions", label: "Subscriptions" },
  { key: "siteSettings", label: "Site Settings" },
];

export default function AdminIndexPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!user || !["admin", "teacher"].includes(user.role))) {
      router.push("/login");
    }
  }, [loading, user, router]);

  if (loading || !user) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-extrabold mb-6">Admin panel</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {STORES.map((s) => (
          <Link
            key={s.key}
            href={`/admin/${s.key}`}
            className="bg-white border border-slate-200 rounded-lg shadow-sm p-5 hover:border-blue-400"
          >
            <h2 className="font-bold">{s.label}</h2>
            <p className="text-sm text-slate-500">
              Manage {s.label.toLowerCase()}.
            </p>
          </Link>
        ))}
      </div>
      <p className="text-xs text-slate-400 mt-6">
        Note: the question-bank editor (per-test questions with answers) is
        deliberately not on this generic list — see the follow-up note below
        for adding a dedicated screen.
      </p>
    </div>
  );
}
