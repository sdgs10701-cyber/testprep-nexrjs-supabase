"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { changePassword, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function ChangePasswordPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await changePassword(newPassword);
      await refresh();
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update password");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-md mx-auto mt-12 px-4">
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6">
        <h1 className="text-xl font-extrabold mb-1">Set a new password</h1>
        <p className="text-sm text-slate-500 mb-5">
          You need to set a new password before continuing.
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="password"
            required
            minLength={4}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password"
            className="border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          />
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="bg-blue-600 text-white font-semibold rounded-md py-2.5 text-sm hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? "Saving…" : "Save password"}
          </button>
        </form>
      </div>
    </div>
  );
}
