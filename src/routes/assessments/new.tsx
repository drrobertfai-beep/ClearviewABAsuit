// New assessment flow — /assessments/new
// Step 1: Select client → Step 2: Select tool → Redirect to form
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { listClientsFn } from "~/server/clients";
import { createAssessmentFn } from "~/server/assessments";
import type { Client } from "~/db/types";

export const Route = createFileRoute("/assessments/new")({
  component: NewAssessmentPage,
  loader: async () => {
    try {
      return await listClientsFn({ data: { status: "active" } });
    } catch {
      return [];
    }
  },
});

type Step = "client" | "tool";

function NewAssessmentPage() {
  const initialClients = (Route.useLoaderData() as Client[]) ?? [];
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("client");
  const [clients, setClients] = useState<Client[]>(initialClients);
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [selectedTool, setSelectedTool] = useState<string>("VB-MAPP");
  const [toolVersion, setToolVersion] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string>("");

  // Reload clients if empty
  useEffect(() => {
    if (initialClients.length === 0) {
      listClientsFn({ data: { status: "active" } })
        .then(setClients)
        .catch(() => {});
    }
  }, [initialClients.length]);

  // Filterable client list
  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return clients;
    const q = clientSearch.toLowerCase();
    return clients.filter((c) => c.name.toLowerCase().includes(q));
  }, [clients, clientSearch]);

  const selectedClient = clients.find((c) => c.id === selectedClientId);

  const toolOptions = [
    {
      value: "VB-MAPP",
      label:
        "VB-MAPP — Verbal Behavior Milestones Assessment and Placement Program",
    },
    {
      value: "ABLLS-R",
      label:
        "ABLLS-R — Assessment of Basic Language and Learning Skills – Revised",
    },
    { value: "AFLS", label: "AFLS — Assessment of Functional Living Skills" },
    {
      value: "PEAK",
      label: "PEAK — Promoting the Emergence of Advanced Knowledge",
    },
    { value: "Other", label: "Other / Custom Assessment" },
  ];

  const handleCreate = async () => {
    if (!selectedClientId) return;
    setError("");
    setCreating(true);

    try {
      const assessment = await createAssessmentFn({
        data: {
          clientId: selectedClientId,
          toolName: selectedTool,
          toolVersion: toolVersion || undefined,
        },
      });

      // Redirect to the form based on tool
      if (selectedTool === "VB-MAPP") {
        navigate({
          to: "/assessments/$id/vb-mapp",
          params: { id: assessment.id },
        });
      } else {
        navigate({
          to: "/assessments/$id",
          params: { id: assessment.id },
        });
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to create assessment. Please try again.",
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Breadcrumb */}
      <nav className="mb-4 text-sm text-gray-500" aria-label="Breadcrumb">
        <ol className="flex items-center gap-2">
          <li>
            <a
              href="/assessments"
              onClick={(e) => {
                e.preventDefault();
                navigate({ to: "/assessments" });
              }}
              className="hover:text-gray-700"
            >
              Assessments
            </a>
          </li>
          <li aria-hidden>/</li>
          <li className="text-gray-900 font-medium">New Assessment</li>
        </ol>
      </nav>

      {/* Step indicator */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
              step === "client"
                ? "bg-indigo-600 text-white"
                : "bg-green-500 text-white"
            }`}
          >
            {step === "client" ? (
              "1"
            ) : (
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={3}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m4.5 12.75 6 6 9-13.5"
                />
              </svg>
            )}
          </div>
          <div className="h-0.5 w-12 bg-gray-200">
            <div
              className={`h-full transition-all ${
                step === "tool" ? "bg-indigo-600 w-full" : "bg-gray-200 w-0"
              }`}
            />
          </div>
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
              step === "tool"
                ? "bg-indigo-600 text-white"
                : "bg-gray-100 text-gray-400"
            }`}
          >
            2
          </div>
        </div>
        <div className="mt-2 flex gap-3 text-xs text-gray-500">
          <span className="w-8 text-center">Client</span>
          <span className="w-12" />
          <span className="w-8 text-center">Tool</span>
        </div>
      </div>

      {/* Step 1: Select Client */}
      {step === "client" && (
        <div className="rounded-lg bg-white p-6 shadow ring-1 ring-black/5 sm:p-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">
            Select Client
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Choose the client for this assessment.
          </p>

          {/* Search */}
          <div className="relative mb-4">
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
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              placeholder="Search clients..."
              className="input w-full pl-10"
              aria-label="Search clients"
            />
          </div>

          {/* Client list */}
          <div className="max-h-80 overflow-y-auto border border-gray-200 rounded-lg">
            {filteredClients.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-500">
                {clientSearch
                  ? "No clients match your search."
                  : "No active clients available."}
              </div>
            ) : (
              <ul className="divide-y divide-gray-100" role="listbox">
                {filteredClients.map((client) => (
                  <li key={client.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selectedClientId === client.id}
                      onClick={() => setSelectedClientId(client.id)}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                        selectedClientId === client.id
                          ? "bg-indigo-50 border-l-4 border-indigo-600"
                          : "border-l-4 border-transparent hover:bg-gray-50"
                      }`}
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700 flex-shrink-0">
                        {client.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {client.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {client.date_of_birth
                            ? `DOB: ${new Date(client.date_of_birth).toLocaleDateString()}`
                            : "DOB: —"}
                          {" · "}
                          {client.setting ?? "No setting"}
                        </p>
                      </div>
                      {selectedClientId === client.id && (
                        <svg
                          className="h-5 w-5 text-indigo-600 flex-shrink-0"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                          aria-hidden="true"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-6 flex justify-between">
            <button
              type="button"
              onClick={() => navigate({ to: "/assessments" })}
              className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!selectedClientId}
              onClick={() => setStep("tool")}
              className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60 transition-colors"
            >
              Continue
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m8.25 4.5 7.5 7.5-7.5 7.5"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Select Tool */}
      {step === "tool" && (
        <div className="rounded-lg bg-white p-6 shadow ring-1 ring-black/5 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <button
              type="button"
              onClick={() => setStep("client")}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              title="Back to client selection"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 19.5 8.25 12l7.5-7.5"
                />
              </svg>
            </button>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Select Assessment Tool
              </h2>
              <p className="text-sm text-gray-500">
                Client:{" "}
                <span className="font-medium text-gray-700">
                  {selectedClient?.name ?? "Unknown"}
                </span>
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {toolOptions.map((tool) => (
              <label
                key={tool.value}
                className={`flex cursor-pointer items-start gap-4 rounded-lg border p-4 transition-colors ${
                  selectedTool === tool.value
                    ? "border-indigo-500 bg-indigo-50"
                    : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <input
                  type="radio"
                  name="tool"
                  value={tool.value}
                  checked={selectedTool === tool.value}
                  onChange={() => setSelectedTool(tool.value)}
                  className="mt-0.5 h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {tool.label}
                  </p>
                </div>
              </label>
            ))}
          </div>

          {/* Tool version */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Version (optional)
            </label>
            <input
              type="text"
              value={toolVersion}
              onChange={(e) => setToolVersion(e.target.value)}
              className="input max-w-xs"
              placeholder="e.g. 2.0"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="mt-6 flex justify-between">
            <button
              type="button"
              onClick={() => navigate({ to: "/assessments" })}
              className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={creating || !selectedTool}
              onClick={handleCreate}
              className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60 transition-colors"
            >
              {creating ? (
                <>
                  <svg
                    className="h-4 w-4 animate-spin"
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
                  Creating&hellip;
                </>
              ) : (
                "Start Assessment"
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
