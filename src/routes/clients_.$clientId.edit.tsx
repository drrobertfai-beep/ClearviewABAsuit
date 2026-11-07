// Edit client page — /clients/:clientId/edit
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import type { ReactNode } from "react";
import { getClientFn, updateClientFn } from "~/server/clients";
import { ClientForm, type ClientFormData } from "~/components/ClientForm";
import type { Client } from "~/db/types";

export const Route = createFileRoute("/clients_/$clientId/edit")({
  component: EditClientPage,
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
      <Link to="/clients" className="mt-6 inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors">
        ← Back to Clients
      </Link>
    </div>
  ),
});

function clientToFormData(client: Client): ClientFormData {
  const insurance = client.insurance_info && typeof client.insurance_info === "object"
    ? (client.insurance_info as Record<string, unknown>) : {};
  const consents = client.consent_flags && typeof client.consent_flags === "object"
    ? (client.consent_flags as Record<string, boolean>) : {};
  const diagnoses: string[] = Array.isArray(client.diagnoses) ? (client.diagnoses as string[]) : [];
  return {
    name: client.name ?? "", date_of_birth: client.date_of_birth ?? "",
    gender: client.gender ?? "", contact_email: client.contact_email ?? "",
    contact_phone: client.contact_phone ?? "", address: client.address ?? "",
    referral_source: client.referral_source ?? "", diagnoses,
    setting: client.setting ?? "",
    insurance_provider: (insurance.provider as string) ?? "",
    insurance_policy_number: (insurance.policy_number as string) ?? "",
    insurance_group_number: (insurance.group_number as string) ?? "",
    photo_release: !!consents.photo_release, telehealth_consent: !!consents.telehealth_consent,
    data_sharing: !!consents.data_sharing, privacy_notes: client.privacy_notes ?? "",
    status: client.status ?? "active",
  };
}

function EditClientPage() {
  const client = Route.useLoaderData() as Client;
  const params = useParams({ from: "/clients_/$clientId/edit" });
  const navigate = useNavigate();
  const [data, setData] = useState<ClientFormData>(() => clientToFormData(client));
  const [errors, setErrors] = useState<Partial<Record<keyof ClientFormData | "form", string>>>({});
  const [saving, setSaving] = useState(false);

  const validate = (): boolean => {
    const e: typeof errors = {};
    if (!data.name.trim()) e.name = "Name is required.";
    if (!data.date_of_birth) e.date_of_birth = "Date of birth is required.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setErrors({});
    try {
      const payload: Partial<Omit<Client, "id" | "created_at" | "updated_at">> = {
        name: data.name.trim(), date_of_birth: data.date_of_birth || null,
        gender: data.gender || null, contact_email: data.contact_email.trim() || null,
        contact_phone: data.contact_phone.trim() || null, address: data.address.trim() || null,
        referral_source: data.referral_source.trim() || null, diagnoses: data.diagnoses,
        setting: (data.setting as Client["setting"]) || null,
        insurance_info: { provider: data.insurance_provider.trim(), policy_number: data.insurance_policy_number.trim(), group_number: data.insurance_group_number.trim() || undefined },
        consent_flags: { photo_release: data.photo_release, telehealth_consent: data.telehealth_consent, data_sharing: data.data_sharing },
        privacy_notes: data.privacy_notes.trim() || null,
        status: (data.status as Client["status"]) || "active",
      };
      await updateClientFn({ data: { id: client.id, data: payload } });
      navigate({ to: "/clients/$clientId", params: { clientId: params.clientId } });
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : "Failed to update client. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
      <nav className="mb-4 text-sm text-gray-500" aria-label="Breadcrumb">
        <ol className="flex items-center gap-2">
          <li><Link to="/clients" className="hover:text-gray-700">Clients</Link></li>
          <li aria-hidden>/</li>
          <li><Link to="/clients/$clientId" params={{ clientId: params.clientId }} className="hover:text-gray-700">{client.name}</Link></li>
          <li aria-hidden>/</li>
          <li className="text-gray-900 font-medium">Edit</li>
        </ol>
      </nav>
      <div className="rounded-lg bg-white p-6 shadow ring-1 ring-black/5 sm:p-8">
        <h1 className="text-xl font-bold text-gray-900 mb-6">Edit Client Profile</h1>
        <form onSubmit={handleSubmit} noValidate>
          <ClientForm data={data} onChange={setData} errors={errors} saving={saving} />
          <div className="mt-8 flex items-center justify-end gap-3 border-t border-gray-100 pt-6">
            <Link to="/clients/$clientId" params={{ clientId: params.clientId }} className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 transition-colors">Cancel</Link>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60 transition-colors">
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
