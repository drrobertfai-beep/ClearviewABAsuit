// New client page — /clients/new
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { createClientFn } from "~/server/clients";
import {
  ClientForm,
  emptyClientForm,
  type ClientFormData,
} from "~/components/ClientForm";
import type { Client } from "~/db/types";

export const Route = createFileRoute("/clients/new")({
  component: NewClientPage,
});

function NewClientPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<ClientFormData>(emptyClientForm());
  const [errors, setErrors] = useState<
    Partial<Record<keyof ClientFormData | "form", string>>
  >({});
  const [saving, setSaving] = useState(false);

  const validate = (): boolean => {
    const e: typeof errors = {};
    if (!data.name.trim()) e.name = "Name is required.";
    if (!data.date_of_birth) e.date_of_birth = "Date of birth is required.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    setErrors({});

    try {
      // Convert ClientFormData → db Client shape
      const payload: Omit<Client, "id" | "created_at" | "updated_at"> = {
        name: data.name.trim(),
        date_of_birth: data.date_of_birth || null,
        gender: data.gender || null,
        contact_email: data.contact_email.trim() || null,
        contact_phone: data.contact_phone.trim() || null,
        address: data.address.trim() || null,
        referral_source: data.referral_source.trim() || null,
        diagnoses: data.diagnoses,
        setting: (data.setting as Client["setting"]) || null,
        insurance_info: {
          provider: data.insurance_provider.trim(),
          policy_number: data.insurance_policy_number.trim(),
          group_number: data.insurance_group_number.trim() || undefined,
        },
        consent_flags: {
          photo_release: data.photo_release,
          telehealth_consent: data.telehealth_consent,
          data_sharing: data.data_sharing,
        },
        privacy_notes: data.privacy_notes.trim() || null,
        status: (data.status as Client["status"]) || "active",
      };

      const client = await createClientFn({ data: payload });
      navigate({ to: "/clients/$clientId", params: { clientId: client.id } });
    } catch (err) {
      setErrors({
        form:
          err instanceof Error
            ? err.message
            : "Failed to create client. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Breadcrumb */}
      <nav className="mb-4 text-sm text-gray-500" aria-label="Breadcrumb">
        <ol className="flex items-center gap-2">
          <li>
            <a
              href="/clients"
              onClick={(e) => {
                e.preventDefault();
                navigate({ to: "/clients" });
              }}
              className="hover:text-gray-700"
            >
              Clients
            </a>
          </li>
          <li aria-hidden>/</li>
          <li className="text-gray-900 font-medium">New Client</li>
        </ol>
      </nav>

      <div className="rounded-lg bg-white p-6 shadow ring-1 ring-black/5 sm:p-8">
        <h1 className="text-xl font-bold text-gray-900 mb-6">
          New Client Profile
        </h1>

        <form onSubmit={handleSubmit} noValidate>
          <ClientForm
            data={data}
            onChange={setData}
            errors={errors}
            saving={saving}
          />

          {/* Actions */}
          <div className="mt-8 flex items-center justify-end gap-3 border-t border-gray-100 pt-6">
            <button
              type="button"
              onClick={() => navigate({ to: "/clients" })}
              className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60 transition-colors"
            >
              {saving ? "Saving…" : "Create Client"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
