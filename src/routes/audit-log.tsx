// ClearView ABA Suite — Audit Log Viewer
// Read-only view of the full audit trail with filtering.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { getAuditLogFn, getAuditEntryFn } from "~/server/audit";
import type { AuditEntry } from "~/db/types";

export const Route = createFileRoute("/audit-log")({
  component: AuditLogPage,
});

function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const pageSize = 25;

  // Filters
  const [filterTable, setFilterTable] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");

  // Detail modal
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getAuditLogFn({
        table: filterTable || undefined,
        action: filterAction || undefined,
        user: filterUser || undefined,
        startDate: filterStartDate || undefined,
        endDate: filterEndDate || undefined,
        limit: pageSize,
        offset: page * pageSize,
      });
      setEntries(result.entries);
      setTotal(result.total);
    } catch (err) {
      console.error("Failed to load audit log:", err);
    } finally {
      setLoading(false);
    }
  }, [filterTable, filterAction, filterUser, filterStartDate, filterEndDate, page]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const totalPages = Math.ceil(total / pageSize);

  const openDetail = async (entry: AuditEntry) => {
    setSelectedEntry(entry);
    setDetailLoading(true);
    try {
      const full = await getAuditEntryFn({ id: entry.id });
      if (full) setSelectedEntry(full);
    } catch {
      // Keep the summary entry
    } finally {
      setDetailLoading(false);
    }
  };

  const actionBadge = (action: string) => {
    const colors: Record<string, string> = {
      CREATE: "bg-green-100 text-green-800",
      UPDATE: "bg-blue-100 text-blue-800",
      DELETE: "bg-red-100 text-red-800",
    };
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[action] ?? "bg-gray-100 text-gray-600"}`}>
        {action}
      </span>
    );
  };

  const changesSummary = (entry: AuditEntry): string => {
    const oldV = typeof entry.old_values === "object" && entry.old_values ? (entry.old_values as Record<string, unknown>) : null;
    const newV = typeof entry.new_values === "object" && entry.new_values ? (entry.new_values as Record<string, unknown>) : null;

    if (entry.action === "CREATE") return "Record created";
    if (entry.action === "DELETE") return "Record deleted";
    if (!oldV && !newV) return "No changes";

    // Compare old and new
    const allKeys = new Set([...Object.keys(oldV ?? {}), ...Object.keys(newV ?? {})]);
    const changedKeys: string[] = [];
    for (const key of allKeys) {
      if (key === "updated_at" || key === "created_at") continue;
      const ov = JSON.stringify((oldV ?? {})[key]);
      const nv = JSON.stringify((newV ?? {})[key]);
      if (ov !== nv) changedKeys.push(key);
    }
    if (changedKeys.length === 0) return "No changes";
    if (changedKeys.length <= 3) return `Changed: ${changedKeys.join(", ")}`;
    return `Changed ${changedKeys.length} field(s): ${changedKeys.slice(0, 3).join(", ")}...`;
  };

  const renderDiff = (entry: AuditEntry) => {
    const oldV = typeof entry.old_values === "object" && entry.old_values ? (entry.old_values as Record<string, unknown>) : null;
    const newV = typeof entry.new_values === "object" && entry.new_values ? (entry.new_values as Record<string, unknown>) : null;

    if (entry.action === "CREATE" && newV) {
      return (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-green-700 mb-2">New Record Values:</p>
          {Object.entries(newV).map(([k, v]) => {
            if (k === "created_at" || k === "updated_at") return null;
            const displayVal = typeof v === "object" ? JSON.stringify(v) : String(v ?? "(null)");
            return (
              <div key={k} className="text-xs">
                <span className="font-medium text-gray-700">{k}:</span>{" "}
                <span className="text-gray-600 break-all">{displayVal.length > 100 ? displayVal.slice(0, 100) + "…" : displayVal}</span>
              </div>
            );
          })}
        </div>
      );
    }

    if (entry.action === "DELETE" && oldV) {
      return (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-red-700 mb-2">Deleted Record Values:</p>
          {Object.entries(oldV).map(([k, v]) => {
            if (k === "created_at" || k === "updated_at") return null;
            const displayVal = typeof v === "object" ? JSON.stringify(v) : String(v ?? "(null)");
            return (
              <div key={k} className="text-xs">
                <span className="font-medium text-gray-700">{k}:</span>{" "}
                <span className="text-gray-600 break-all">{displayVal.length > 100 ? displayVal.slice(0, 100) + "…" : displayVal}</span>
              </div>
            );
          })}
        </div>
      );
    }

    // UPDATE: show side-by-side diff
    const allKeys = new Set([...Object.keys(oldV ?? {}), ...Object.keys(newV ?? {})]);
    const changedFields: { key: string; old: string; new: string }[] = [];
    for (const key of allKeys) {
      if (key === "updated_at" || key === "created_at") continue;
      const ov = JSON.stringify((oldV ?? {})[key]);
      const nv = JSON.stringify((newV ?? {})[key]);
      if (ov !== nv) {
        changedFields.push({
          key,
          old: ov.length > 80 ? ov.slice(0, 80) + "…" : ov,
          new: nv.length > 80 ? nv.slice(0, 80) + "…" : nv,
        });
      }
    }
    if (changedFields.length === 0) {
      return <p className="text-xs text-gray-500">No changes detected.</p>;
    }
    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold text-blue-700 mb-2">
          Changed {changedFields.length} field{changedFields.length > 1 ? "s" : ""}:
        </p>
        {changedFields.map((f) => (
          <div key={f.key} className="rounded bg-gray-50 p-2 text-xs">
            <div className="font-medium text-gray-900 mb-1">{f.key}</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-red-600 font-medium">Old:</span>{" "}
                <span className="text-gray-600 break-all">{f.old || "(empty)"}</span>
              </div>
              <div>
                <span className="text-green-600 font-medium">New:</span>{" "}
                <span className="text-gray-600 break-all">{f.new || "(empty)"}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Audit Log</h1>
        <p className="mt-1 text-sm text-gray-500">
          Complete trail of all data changes across the system.
        </p>
      </div>

      {/* Filters */}
      <div className="rounded-lg bg-white p-4 shadow ring-1 ring-black/5 mb-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Table</label>
            <select
              value={filterTable}
              onChange={(e) => { setFilterTable(e.target.value); setPage(0); }}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">All Tables</option>
              <option value="clients">Clients</option>
              <option value="assessments">Assessments</option>
              <option value="treatment_plans">Treatment Plans</option>
              <option value="signatures">Signatures</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Action</label>
            <select
              value={filterAction}
              onChange={(e) => { setFilterAction(e.target.value); setPage(0); }}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">All Actions</option>
              <option value="CREATE">CREATE</option>
              <option value="UPDATE">UPDATE</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">User</label>
            <input
              type="text"
              placeholder="Filter by user..."
              value={filterUser}
              onChange={(e) => { setFilterUser(e.target.value); setPage(0); }}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
            <input
              type="date"
              value={filterStartDate}
              onChange={(e) => { setFilterStartDate(e.target.value); setPage(0); }}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
            <input
              type="date"
              value={filterEndDate}
              onChange={(e) => { setFilterEndDate(e.target.value); setPage(0); }}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => {
                setFilterTable("");
                setFilterAction("");
                setFilterUser("");
                setFilterStartDate("");
                setFilterEndDate("");
                setPage(0);
              }}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg bg-white shadow ring-1 ring-black/5 overflow-hidden">
        {loading ? (
          <div className="flex items-center gap-3 py-12 text-gray-500 justify-center">
            <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading audit log…
          </div>
        ) : entries.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-500">
            No audit entries found.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Timestamp</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">User</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Table</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Record ID</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Action</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Changes</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {entries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap font-mono text-xs">
                        {new Date(entry.changed_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-gray-900 whitespace-nowrap">
                        {entry.changed_by ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap font-mono text-xs">
                        {entry.table_name}
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap font-mono text-xs max-w-[120px] truncate">
                        {entry.record_id.slice(0, 8)}…
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {actionBadge(entry.action)}
                      </td>
                      <td className="px-4 py-3 text-gray-600 max-w-[250px] truncate">
                        {changesSummary(entry)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openDetail(entry)}
                          className="text-indigo-600 hover:text-indigo-800 text-xs font-medium"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 bg-gray-50">
                <p className="text-xs text-gray-500">
                  Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-gray-500">
                    Page {page + 1} of {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail Modal */}
      {selectedEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Audit Entry Detail</h2>
                <p className="text-xs text-gray-500 mt-1">ID: {selectedEntry.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEntry(null)}
                className="rounded-md p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <dl className="grid grid-cols-2 gap-3 mb-4 text-sm">
              <div>
                <dt className="text-xs font-medium text-gray-500">Timestamp</dt>
                <dd className="text-gray-900">{new Date(selectedEntry.changed_at).toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">User</dt>
                <dd className="text-gray-900">{selectedEntry.changed_by ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">Table</dt>
                <dd className="text-gray-900 font-mono">{selectedEntry.table_name}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">Record ID</dt>
                <dd className="text-gray-900 font-mono text-xs">{selectedEntry.record_id}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">Action</dt>
                <dd>{actionBadge(selectedEntry.action)}</dd>
              </div>
            </dl>

            <div className="border-t border-gray-200 pt-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Changes</h3>
              {detailLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Loading…
                </div>
              ) : (
                renderDiff(selectedEntry)
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedEntry(null)}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
