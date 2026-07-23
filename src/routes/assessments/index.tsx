// Assessments list page — /assessments
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { listAssessmentsFn } from "~/server/assessments";
import { listClientsFn } from "~/server/clients";
import type { Assessment, Client } from "~/db/types";

export const Route = createFileRoute("/assessments/")({
  component: AssessmentListPage,
  loader: async () => {
    try {
      const [assessments, clients] = await Promise.all([
        listAssessmentsFn(),
        listClientsFn(),
      ]);
      return { assessments, clients };
    } catch {
      return { assessments: [] as Assessment[], clients: [] as Client[] };
    }
  },
});

function AssessmentListPage() {
  const { assessments: initialAssessments, clients: initialClients } =
    Route.useLoaderData() as {
      assessments: Assessment[];
      clients: Client[];
    };

  const [assessments, setAssessments] =
    useState<Assessment[]>(initialAssessments);
  const [clients, setClients] = useState<Client[]>(initialClients);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [toolFilter, setToolFilter] = useState("");
  const [loading, setLoading] = useState(false);

  // Reload on mount if loader returned empty
  useEffect(() => {
    if (initialAssessments.length === 0 && initialClients.length === 0) {
      setLoading(true);
      Promise.all([listAssessmentsFn(), listClientsFn()])
        .then(([a, c]) => {
          setAssessments(a);
          setClients(c);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [initialAssessments.length, initialClients.length]);

  // Build client lookup map
  const clientMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of clients) {
      map[c.id] = c.name;
    }
    return map;
  }, [clients]);

  // Filter
  const filtered = useMemo(() => {
    let list = assessments;
    if (statusFilter) {
      list = list.filter((a) => a.status === statusFilter);
    }
    if (toolFilter) {
      list = list.filter((a) => a.tool_name === toolFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((a) => {
        const clientName = (clientMap[a.client_id] ?? "").toLowerCase();
        return (
          clientName.includes(q) ||
          a.tool_name.toLowerCase().includes(q) ||
          (a.assessor_name ?? "").toLowerCase().includes(q)
        );
      });
    }
    return list;
  }, [assessments, statusFilter, toolFilter, search, clientMap]);

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      draft: "bg-gray-100 text-gray-600",
      in_progress: "bg-yellow-100 text-yellow-800",
      completed: "bg-green-100 text-green-800",
    };
    const labels: Record<string, string> = {
      draft: "Draft",
      in_progress: "In Progress",
      completed: "Completed",
    };
    return (
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
          colors[status] ?? "bg-gray-100 text-gray-600"
        }`}
      >
        {labels[status] ?? status}
      </span>
    );
  };

  // Compute score summary for display
  const scoreSummary = (a: Assessment): string => {
    if (!a.raw_scores || typeof a.raw_scores !== "object") return "—";
    const rs = a.raw_scores as Record<string, unknown>;
    const computed = rs._computed as Record<string, unknown> | undefined;

    if (computed?.milestones && typeof computed.milestones === "object") {
      const ms = computed.milestones as Record<string, unknown>;
      const overall = ms.overallTotal ?? "—";
      return `MS: ${overall}`;
    }

    // Fallback: try direct milestones
    if (rs.milestones && typeof rs.milestones === "object") {
      return "Scored";
    }
    return "—";
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Assessments</h1>
          <p className="mt-1 text-sm text-gray-500">
            {filtered.length} assessment{filtered.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link
          to="/assessments/new"
          className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4.5v15m7.5-7.5h-15"
            />
          </svg>
          New Assessment
        </Link>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
            />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by client name, tool, or assessor..."
            className="input w-full pl-10"
            aria-label="Search assessments"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input sm:w-40"
          aria-label="Filter by status"
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>
        <select
          value={toolFilter}
          onChange={(e) => setToolFilter(e.target.value)}
          className="input sm:w-40"
          aria-label="Filter by assessment tool"
        >
          <option value="">All Tools</option>
          <option value="VB-MAPP">VB-MAPP</option>
          <option value="ABLLS-R">ABLLS-R</option>
          <option value="AFLS">AFLS</option>
          <option value="PEAK">PEAK</option>
          <option value="Other">Other</option>
        </select>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-3 py-12 text-gray-500 justify-center">
          <svg
            className="h-5 w-5 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Loading assessments&hellip;
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-gray-300 py-16 text-center">
          <svg
            className="mx-auto h-10 w-10 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z"
            />
          </svg>
          <p className="mt-3 text-sm font-medium text-gray-900">
            {search || statusFilter || toolFilter
              ? "No assessments match your filters"
              : "No assessments yet"}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {search || statusFilter || toolFilter
              ? "Try adjusting your search or filter criteria."
              : "Get started by creating your first assessment."}
          </p>
          {!search && !statusFilter && !toolFilter && (
            <Link
              to="/assessments/new"
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors"
            >
              New Assessment
            </Link>
          )}
        </div>
      )}

      {/* Assessment table */}
      {!loading && filtered.length > 0 && (
        <div className="overflow-hidden rounded-lg bg-white shadow ring-1 ring-black/5">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                    Client
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                    Assessment Tool
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500 hidden sm:table-cell">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500 hidden md:table-cell">
                    Score Summary
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((a) => (
                  <tr
                    key={a.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-gray-900">
                        {clientMap[a.client_id] ?? "Unknown Client"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {a.tool_name}
                      {a.tool_version && (
                        <span className="text-xs text-gray-400 ml-1">
                          v{a.tool_version}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 hidden sm:table-cell">
                      {a.assessment_date
                        ? new Date(a.assessment_date).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3">{statusBadge(a.status)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">
                      {scoreSummary(a)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to="/assessments/$id"
                          params={{ id: a.id }}
                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                          title="View assessment"
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                            aria-hidden="true"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                            />
                          </svg>
                        </Link>
                        {(a.status === "draft" ||
                          a.status === "in_progress") && (
                          <Link
                            to="/assessments/$id/vb-mapp"
                            params={{ id: a.id }}
                            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                            title="Edit assessment"
                          >
                            <svg
                              className="h-4 w-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                              aria-hidden="true"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
                              />
                            </svg>
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
