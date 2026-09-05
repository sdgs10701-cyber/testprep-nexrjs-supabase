"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

const roleBadgeClass: Record<string, string> = {
  admin: "bg-amber-100 text-amber-800",
  teacher: "bg-purple-100 text-purple-700",
  guide: "bg-sky-100 text-sky-700",
  user: "bg-blue-100 text-blue-700",
};

export default function SiteHeader() {
  const { user, logout, loading } = useAuth();
  const router = useRouter();

  return (
    <header className="sticky top-0 z-20 bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        <Link href="/" className="text-xl font-extrabold text-blue-600">
          TestPrep Portal
        </Link>

        <nav className="hidden sm:flex items-center gap-5 text-sm font-semibold text-slate-500">
          <Link href="/" className="hover:text-blue-600">
            Test Series
          </Link>
          <Link href="/leaderboard" className="hover:text-blue-600">
            Leaderboard
          </Link>
          {user && (
            <Link href="/results" className="hover:text-blue-600">
              My Results
            </Link>
          )}
          {user && ["admin", "teacher"].includes(user.role) && (
            <Link href="/admin" className="hover:text-blue-600">
              Admin
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-3">
          {loading ? null : user ? (
            <>
              <span
                className={`text-xs font-bold uppercase px-2 py-1 rounded ${
                  roleBadgeClass[user.role] || "bg-slate-100 text-slate-600"
                }`}
              >
                {user.role}
              </span>
              <span className="hidden sm:inline text-sm text-slate-500">
                {user.email}
              </span>
              <button
                onClick={() => {
                  logout();
                  router.push("/login");
                }}
                className="text-sm font-semibold px-3 py-1.5 rounded-md bg-slate-200 hover:opacity-90"
              >
                Logout
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="text-sm font-semibold px-3 py-1.5 rounded-md bg-blue-600 text-white hover:opacity-90"
            >
              Login
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
