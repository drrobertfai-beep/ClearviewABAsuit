// ClearView ABA Suite — Reusable Client Form
// Used by both create (new) and edit pages.
// Organised into tabs: Basic Info, Contact, Clinical, Insurance & Consent.

import { useState } from "react";

// ---- Local form data type (mirrors Client fields with string-friendly values) ----

export interface ClientFormData {
  name: string;
  date_of_birth: string;
  gender: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  referral_source: string;
  diagnoses: string[];
  setting: string;
  insurance_provider: string;
  insurance_policy_number: string;
  insurance_group_number: string;
  photo_release: boolean;
  telehealth_consent: boolean;
  data_sharing: boolean;
  privacy_notes: string;
  status: string;
}

export function emptyClientForm(): ClientFormData {
  return {
    name: "",
    date_of_birth: "",
    gender: "",
    contact_email: "",
    contact_phone: "",
    address: "",
    referral_source: "",
    diagnoses: [],
    setting: "",
    insurance_provider: "",
    insurance_policy_number: "",
    insurance_group_number: "",
    photo_release: false,
    telehealth_consent: false,
    data_sharing: false,
    privacy_notes: "",
    status: "active",
  };
}

// ---- Predefined lists ----

const DIAGNOSIS_OPTIONS = [
  "Autism Spectrum Disorder (F84.0)",
  "ADHD",
  "Speech Delay",
  "Global Developmental Delay",
  "Anxiety Disorder",
  "OCD",
  "Oppositional Defiant Disorder",
  "Intellectual Disability",
  "Specific Learning Disorder",
  "Sensory Processing Disorder",
  "Social (Pragmatic) Communication Disorder",
  "Other",
];

const GENDER_OPTIONS = [
  { value: "", label: "— Select —" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "undisclosed", label: "Prefer not to say" },
];

const SETTING_OPTIONS = [
  { value: "", label: "— Select —" },
  { value: "home", label: "Home" },
  { value: "school", label: "School" },
  { value: "clinic", label: "Clinic" },
  { value: "other", label: "Other" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "archived", label: "Archived" },
];

type TabId = "basic" | "contact" | "clinical" | "insurance";

const TABS: { id: TabId; label: string }[] = [
  { id: "basic", label: "Basic Info" },
  { id: "contact", label: "Contact & Referral" },
  { id: "clinical", label: "Clinical" },
  { id: "insurance", label: "Insurance & Consent" },
];

// ---- Props ----

interface ClientFormProps {
  data: ClientFormData;
  onChange: (data: ClientFormData) => void;
  errors: Partial<Record<keyof ClientFormData | "form", string>>;
  saving: boolean;
}

// ---- Component ----

export function ClientForm({ data, onChange, errors, saving }: ClientFormProps) {
  const [activeTab, setActiveTab] = useState<TabId>("basic");

  const update = (patch: Partial<ClientFormData>) => {
    onChange({ ...data, ...patch });
  };

  const toggleDiagnosis = (diagnosis: string) => {
    const next = data.diagnoses.includes(diagnosis)
      ? data.diagnoses.filter((d) => d !== diagnosis)
      : [...data.diagnoses, diagnosis];
    update({ diagnoses: next });
  };

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-4 overflow-x-auto" aria-label="Form sections">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab panels */}
      {activeTab === "basic" && (
        <div className="space-y-4">
          <Field label="Full Name" required error={errors.name}>
            <input
              type="text"
              value={data.name}
              onChange={(e) => update({ name: e.target.value })}
              className="input"
              placeholder="First and last name"
              aria-required="true"
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Date of Birth" required error={errors.date_of_birth}>
              <input
                type="date"
                value={data.date_of_birth}
                onChange={(e) => update({ date_of_birth: e.target.value })}
                className="input"
                aria-required="true"
              />
            </Field>

            <Field label="Gender" error={errors.gender}>
              <select
                value={data.gender}
                onChange={(e) => update({ gender: e.target.value })}
                className="input"
              >
                {GENDER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Status" error={errors.status}>
            <div className="flex gap-3">
              {STATUS_OPTIONS.map((o) => (
                <label key={o.value} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    name="status"
                    value={o.value}
                    checked={data.status === o.value}
                    onChange={() => update({ status: o.value })}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </Field>
        </div>
      )}

      {activeTab === "contact" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Contact Email" error={errors.contact_email}>
              <input
                type="email"
                value={data.contact_email}
                onChange={(e) => update({ contact_email: e.target.value })}
                className="input"
                placeholder="email@example.com"
              />
            </Field>

            <Field label="Contact Phone" error={errors.contact_phone}>
              <input
                type="tel"
                value={data.contact_phone}
                onChange={(e) => update({ contact_phone: e.target.value })}
                className="input"
                placeholder="555-0100"
              />
            </Field>
          </div>

          <Field label="Address" error={errors.address}>
            <textarea
              value={data.address}
              onChange={(e) => update({ address: e.target.value })}
              className="input"
              rows={2}
              placeholder="Street, city, state, ZIP"
            />
          </Field>

          <Field label="Referral Source" error={errors.referral_source}>
            <input
              type="text"
              value={data.referral_source}
              onChange={(e) => update({ referral_source: e.target.value })}
              className="input"
              placeholder="e.g. Dr. Patel (Pediatrician), Early Intervention, Self-referred"
            />
          </Field>
        </div>
      )}

      {activeTab === "clinical" && (
        <div className="space-y-4">
          <Field label="Setting" error={errors.setting}>
            <select
              value={data.setting}
              onChange={(e) => update({ setting: e.target.value })}
              className="input"
            >
              {SETTING_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          <fieldset>
            <legend className="block text-sm font-medium text-gray-700 mb-2">
              Diagnoses
            </legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {DIAGNOSIS_OPTIONS.map((diagnosis) => {
                const checked = data.diagnoses.includes(diagnosis);
                return (
                  <label
                    key={diagnosis}
                    className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                      checked
                        ? "border-indigo-500 bg-indigo-50 text-indigo-800"
                        : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleDiagnosis(diagnosis)}
                      className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    {diagnosis}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <Field label="Privacy Notes" error={errors.privacy_notes}>
            <textarea
              value={data.privacy_notes}
              onChange={(e) => update({ privacy_notes: e.target.value })}
              className="input"
              rows={3}
              placeholder="HIPAA-relevant notes, communication preferences, special instructions..."
            />
          </Field>
        </div>
      )}

      {activeTab === "insurance" && (
        <div className="space-y-4">
          <div className="rounded-md bg-gray-50 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-800">
              Insurance Information
            </h3>
            <Field label="Provider Name">
              <input
                type="text"
                value={data.insurance_provider}
                onChange={(e) => update({ insurance_provider: e.target.value })}
                className="input"
                placeholder="e.g. Blue Cross Blue Shield"
              />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Policy Number">
                <input
                  type="text"
                  value={data.insurance_policy_number}
                  onChange={(e) =>
                    update({ insurance_policy_number: e.target.value })
                  }
                  className="input"
                  placeholder="Policy #"
                />
              </Field>
              <Field label="Group Number">
                <input
                  type="text"
                  value={data.insurance_group_number}
                  onChange={(e) =>
                    update({ insurance_group_number: e.target.value })
                  }
                  className="input"
                  placeholder="Group # (optional)"
                />
              </Field>
            </div>
          </div>

          <div className="rounded-md bg-gray-50 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-800">
              Consent Flags
            </h3>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={data.photo_release}
                onChange={(e) => update({ photo_release: e.target.checked })}
                className="mt-0.5 h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500"
              />
              <span>
                <strong>Photo Release</strong> — Authorization to use
                photographs/video for clinical or educational purposes
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={data.telehealth_consent}
                onChange={(e) =>
                  update({ telehealth_consent: e.target.checked })
                }
                className="mt-0.5 h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500"
              />
              <span>
                <strong>Telehealth Consent</strong> — Consent to receive
                services via telehealth/remote platforms
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={data.data_sharing}
                onChange={(e) => update({ data_sharing: e.target.checked })}
                className="mt-0.5 h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500"
              />
              <span>
                <strong>Data Sharing</strong> — Authorization to share
                treatment data with other providers
              </span>
            </label>
          </div>
        </div>
      )}

      {/* Form-level error */}
      {errors.form && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {errors.form}
        </div>
      )}

      {/* Saving indicator */}
      {saving && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
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
          Saving&hellip;
        </div>
      )}
    </div>
  );
}

// ---- Small helper for labelled form fields ----

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && (
        <p className="mt-1 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
