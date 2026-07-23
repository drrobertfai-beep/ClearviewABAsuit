// Treatment plans list page — /treatment-plans
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { listTreatmentPlansFn } from "~/server/treatment-plans";
import { listClientsFn } from "~/server/clients";
import type { TreatmentPlan, Client } from "~/db/types";

export const Route = createFileRoute("/treatment-plans/")({
  component: TreatmentPlanListPage,
  loader: async () => {
    try {
      const [plans, clients] = await Promise.all([
        listTreatmentPlansFn(),
        listClientsFn(),
      ]);
      return { plans, clients };
    } catch {
      return { plans: [] as TreatmentPlan[], clients: [] as Client[] };
    }
  },
});

function TreatmentPlanListPage() {
  const { plans: initialPlans, clients: initialClients } =
    Route.useLoaderData() as {
      plans: TreatmentPlan[];
      clients: Client[];
    };

  const [plans, setPlans] = useState<TreatmentPlan[]>(initialPlans);
  const [clients, setClients] = useState<Client[]>(initialClients);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialPlans.length === 0 && initialClients.length === 0) {
      setLoading(true);
      Promise.all([listTreatmentPlansFn(), listClientsFn()])
        .then(([p, c]) => {
          setPlans(p);
          setClients(c);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [initialPlans.length, initialClients.length]);

  const clientMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of clients) {
      map[c.id] = c.name;
    }
    return map;
  }, [clients]);

  const filtered = useMemo(() => {
    let list = plans;
    if (statusFilter) {
      list = list.filter((p) => p.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => {
        const clientName = (clientMap[p.client_id] ?? "").toLowerCase();
        return clientName.includes(q);
      });
    }
    return list;
  }, [plans, statusFilter, search, clientMap]);

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      draft: "bg-gray-100 text-gray-600",
      review: "bg-yellow-100 text-yellow-800",
      approved: "bg-blue-100 text-blue-800",
      active: "bg-green-100 text-green-800",
      completed: "bg-emerald-100 text-emerald-800",
    };
    const labels: Record<string, string> = {
      draft: "Draft",
      review: "In Review",
      approved: "Approved",
      active: "Active",
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

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Treatment Plans</h1>
          <p className="mt-1 text-sm text-gray-500">
            {filtered.length} plan{filtered.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link
          to="/treatment-plans/new"
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
          New Treatment Plan
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
            placeholder="Search by client name..."
            className="input w-full pl-10"
            aria-label="Search treatment plans"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input sm:w-44"
          aria-label="Filter by status"
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="review">In Review</option>
          <option value="approved">Approved</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
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
          Loading treatment plans&hellip;
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
              d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
            />
          </svg>
          <p className="mt-3 text-sm font-medium text-gray-900">
            {search || statusFilter
              ? "No treatment plans match your filters"
              : "No treatment plans yet"}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {search || statusFilter
              ? "Try adjusting your search or filter criteria."
              : "Get started by creating your first treatment plan from an assessment."}
          </p>
          {!search && !statusFilter && (
            <Link
              to="/treatment-plans/new"
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors"
            >
              New Treatment Plan
            </Link>
          )}
        </div>
      )}

      {/* Plans table */}
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
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500 hidden sm:table-cell">
                    Created
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500 hidden md:table-cell">
                    Assessment
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((plan) => (
                  <tr
                    key={plan.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-gray-900">
                        {clientMap[plan.client_id] ?? "Unknown Client"}
                      </span>
                    </td>
                    <td className="px-4 py-3">{statusBadge(plan.status)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 hidden sm:table-cell">
                      {plan.created_at
                        ? new Date(plan.created_at).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">
                      {plan.assessment_id ? "Linked" : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to="/treatment-plans/$id"
                          params={{ id: plan.id }}
                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                          title="View plan"
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
                        {(plan.status === "draft" ||
                          plan.status === "review") && (
                          <Link
                            to="/treatment-plans/$id/edit"
                            params={{ id: plan.id }}
                            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                            title="Edit plan"
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
