// Client detail page — /clients/:clientId
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { getClientFn, deleteClientFn } from "~/server/clients";
import type { Client } from "~/db/types";

export const Route = createFileRoute("/clients/$clientId")({
  component: ClientDetailPage,
  loader: async ({ params }) => {
    try {
      const client = await getClientFn({ data: { id: params.clientId } });
      if (!client) throw new Error("Client not found");
      return client;
    } catch {
      throw new Error("Client not found");
    }
  },
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-3xl px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-gray-900">Client Not Found</h1>
      <p className="mt-2 text-gray-500">
        {error instanceof Error ? error.message : "The client could not be loaded."}
      </p>
      <Link
        to="/clients"
        className="mt-6 inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
      >
        ← Back to Clients
      </Link>
    </div>
  ),
});

function ClientDetailPage() {
  const client = Route.useLoaderData() as Client;
  const params = useParams({ from: "/clients/$clientId" });
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteClientFn({ data: { id: client.id } });
      navigate({ to: "/clients" });
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Delete failed. Please try again.",
      );
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const diagnoses: string[] = Array.isArray(client.diagnoses)
    ? (client.diagnoses as string[])
    : [];
  const insurance =
    client.insurance_info && typeof client.insurance_info === "object"
      ? (client.insurance_info as Record<string, unknown>)
      : {};
  const consents =
    client.consent_flags && typeof client.consent_flags === "object"
      ? (client.consent_flags as Record<string, boolean>)
      : {};

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      active: "bg-green-100 text-green-800",
      inactive: "bg-yellow-100 text-yellow-800",
      archived: "bg-gray-100 text-gray-600",
    };
    return (
      <span
        className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
          colors[status] ?? "bg-gray-100 text-gray-600"
        }`}
      >
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const settingLabel: Record<string, string> = {
    home: "Home",
    school: "School",
    clinic: "Clinic",
    other: "Other",
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      <nav className="mb-4 text-sm text-gray-500" aria-label="Breadcrumb">
        <ol className="flex items-center gap-2">
          <li><Link to="/clients" className="hover:text-gray-700">Clients</Link></li>
          <li aria-hidden>/</li>
          <li className="text-gray-900 font-medium truncate max-w-[200px]">{client.name}</li>
        </ol>
      </nav>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
          {statusBadge(client.status)}
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/clients/$clientId/edit"
            params={{ clientId: params.clientId }}
            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
            </svg>
            Edit
          </Link>
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-2 text-sm font-semibold text-red-600 shadow-sm ring-1 ring-inset ring-red-300 hover:bg-red-50 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
            </svg>
            Delete
          </button>
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">Are you sure you want to delete {client.name}? This action cannot be undone.</p>
          {deleteError && <p className="mt-1 text-sm text-red-600">{deleteError}</p>}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={handleDelete} disabled={deleting} className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60 transition-colors">
              {deleting ? "Deleting…" : "Yes, delete"}
            </button>
            <button type="button" onClick={() => setShowDeleteConfirm(false)} disabled={deleting} className="rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-6">
        <Section title="Basic Information">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Full Name" value={client.name} />
            <Field label="Date of Birth" value={client.date_of_birth ? new Date(client.date_of_birth).toLocaleDateString() : "—"} />
            <Field label="Gender" value={client.gender ? client.gender.charAt(0).toUpperCase() + client.gender.slice(1) : "—"} />
            <Field label="Setting" value={client.setting ? (settingLabel[client.setting] ?? client.setting) : "—"} />
          </dl>
        </Section>

        <Section title="Contact & Referral">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Email" value={client.contact_email || "—"} />
            <Field label="Phone" value={client.contact_phone || "—"} />
            <Field label="Address" value={client.address || "—"} span="full" />
            <Field label="Referral Source" value={client.referral_source || "—"} span="full" />
          </dl>
        </Section>

        <Section title="Clinical">
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Diagnoses</h4>
            {diagnoses.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {diagnoses.map((d) => (
                  <span key={d} className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-700/10">{d}</span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">None recorded</p>
            )}
          </div>
          {client.privacy_notes && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-1">Privacy Notes</h4>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{client.privacy_notes}</p>
            </div>
          )}
        </Section>

        <Section title="Insurance">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Provider" value={(insurance.provider as string) || "—"} />
            <Field label="Policy Number" value={(insurance.policy_number as string) || "—"} />
            <Field label="Group Number" value={(insurance.group_number as string) || "—"} />
          </dl>
        </Section>

        <Section title="Consents">
          <div className="space-y-2">
            <ConsentBadge label="Photo Release" granted={!!consents.photo_release} />
            <ConsentBadge label="Telehealth Consent" granted={!!consents.telehealth_consent} />
            <ConsentBadge label="Data Sharing" granted={!!consents.data_sharing} />
          </div>
        </Section>

        <Section title="Record Info">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Created" value={new Date(client.created_at).toLocaleString()} />
            <Field label="Last Updated" value={new Date(client.updated_at).toLocaleString()} />
          </dl>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <div className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5 sm:p-6"><h3 className="text-base font-semibold text-gray-900 mb-4">{title}</h3>{children}</div>;
}

function Field({ label, value, span }: { label: string; value: string; span?: string }) {
  return <div className={span === "full" ? "sm:col-span-2" : ""}><dt className="text-xs font-medium uppercase text-gray-500">{label}</dt><dd className="mt-1 text-sm text-gray-900">{value}</dd></div>;
}

function ConsentBadge({ label, granted }: { label: string; granted: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${granted ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`} aria-label={granted ? "Granted" : "Not granted"}>
        {granted ? (
          <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" /></svg>
        ) : (
          <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>
        )}
      </span>
      <span className={granted ? "text-gray-900" : "text-gray-400"}>{label}</span>
    </div>
  );
}
