"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { dbGetAll, dbPut, dbDelete, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

type Row = Record<string, unknown> & { id?: number | string };

export default function GenericStorePage() {
  const params = useParams<{ store: string }>();
  const store = params.store;
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [draftJson, setDraftJson] = useState("");

  useEffect(() => {
    if (!authLoading && (!user || !["admin", "teacher"].includes(user.role))) {
      router.push("/login");
    }
  }, [authLoading, user, router]);

  const load = useCallback(() => {
    setLoading(true);
    dbGetAll<Row>(store)
      .then(setRows)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Failed to load")
      )
      .finally(() => setLoading(false));
  }, [store]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  function openNew() {
    setEditing({});
    setDraftJson("{\n  \n}");
  }

  function openEdit(row: Row) {
    setEditing(row);
    const { id: _id, ...rest } = row;
    void _id;
    setDraftJson(JSON.stringify(rest, null, 2));
  }

  async function saveDraft() {
    if (!editing) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(draftJson);
    } catch {
      setError("Invalid JSON — please fix and try again.");
      return;
    }
    const payload = editing.id !== undefined ? { ...parsed, id: editing.id } : parsed;
    try {
      await dbPut(store, payload);
      setEditing(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    }
  }

  async function handleDelete(id: number | string) {
    if (!confirm("Delete this record?")) return;
    try {
      await dbDelete(store, id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  if (authLoading || !user) return null;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold capitalize">{store}</h1>
        <button
          onClick={openNew}
          className="bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-md"
        >
          + New
        </button>
      </div>

      {error && (
        <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="p-3">ID</th>
                <th className="p-3">Data</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={String(row.id)} className="border-t border-slate-100 align-top">
                  <td className="p-3 font-bold text-slate-400">{String(row.id)}</td>
                  <td className="p-3 max-w-lg">
                    <pre className="whitespace-pre-wrap break-words text-xs text-slate-600">
                      {JSON.stringify(
                        Object.fromEntries(
                          Object.entries(row).filter(([k]) => k !== "id")
                        ),
                        null,
                        1
                      )}
                    </pre>
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => openEdit(row)}
                      className="text-blue-600 font-semibold mr-3"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => row.id !== undefined && handleDelete(row.id)}
                      className="text-red-600 font-semibold"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-4 text-slate-500">
                    No records yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-lg flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="font-bold">
                {editing.id !== undefined ? `Edit #${editing.id}` : "New record"}
              </h2>
              <button
                onClick={() => setEditing(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              <p className="text-xs text-slate-500 mb-2">
                Edit the record's fields as JSON (matches the fields this
                store's backend model expects).
              </p>
              <textarea
                value={draftJson}
                onChange={(e) => setDraftJson(e.target.value)}
                rows={14}
                className="w-full border border-slate-300 rounded-md p-2 font-mono text-xs focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="p-4 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setEditing(null)}
                className="px-4 py-2 rounded-md bg-slate-200 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={saveDraft}
                className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-semibold"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
