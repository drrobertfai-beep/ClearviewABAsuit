// ClearView ABA Suite — Assessment graph attachments for a treatment plan
//
// The file itself never gets a public URL: it is read back through
// /api/plan-attachments?id=…, which resolves the caller's practice from the
// session. This component uploads in chunks (so a 10 MB file fits the host's
// request-body limit), lists what is attached, and lets a clinician remove one.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  deletePlanAttachmentFn,
  listPlanAttachmentsFn,
} from "~/server/attachments";
import type { PlanAttachment } from "~/db/types";

/** Bytes per upload request. Kept well under the production body limit. */
const CHUNK_BYTES = 1024 * 1024;

const MAX_BYTES = 10 * 1024 * 1024;

const ACCEPTED = "image/png,image/jpeg,application/pdf";

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function typeLabel(mime: string): string {
  if (mime === "application/pdf") return "PDF";
  if (mime === "image/png") return "PNG";
  if (mime === "image/jpeg") return "JPG";
  return mime;
}

async function postJson(payload: Record<string, unknown>) {
  const res = await fetch("/api/plan-attachments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    id?: string;
    attachment?: PlanAttachment;
  };
  if (!res.ok) {
    throw new Error(json.error || "Upload failed.");
  }
  return json;
}

export function PlanAttachments({
  planId,
  canEdit,
}: {
  planId: string;
  canEdit: boolean;
}) {
  const [attachments, setAttachments] = useState<PlanAttachment[]>([]);
  const [maxAttachments, setMaxAttachments] = useState(20);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await listPlanAttachmentsFn({ data: { planId } });
      setAttachments(result.attachments);
      setMaxAttachments(result.maxAttachments);
    } catch {
      setError("Could not load attachments.");
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const upload = async (file: File) => {
    setError("");
    const mime =
      file.type === "image/jpg" || file.type === ""
        ? file.name.toLowerCase().endsWith(".pdf")
          ? "application/pdf"
          : file.name.toLowerCase().endsWith(".png")
            ? "image/png"
            : "image/jpeg"
        : file.type;

    if (file.size > MAX_BYTES) {
      setError("Each attachment must be 10 MB or smaller.");
      return;
    }
    if (attachments.length >= maxAttachments) {
      setError(
        `A plan can hold at most ${maxAttachments} attachments. Delete one to add another.`,
      );
      return;
    }

    setUploading(file.name);
    setProgress(0);
    try {
      const { id } = await postJson({
        action: "init",
        planId,
        filename: file.name,
        mimeType: mime,
        byteSize: file.size,
      });
      if (!id) throw new Error("Upload could not be started.");

      for (let offset = 0; offset < file.size; offset += CHUNK_BYTES) {
        const slice = file.slice(offset, Math.min(offset + CHUNK_BYTES, file.size));
        const bytes = new Uint8Array(await slice.arrayBuffer());
        await postJson({ action: "chunk", id, data: toBase64(bytes) });
        setProgress(Math.min(100, Math.round(((offset + bytes.length) / file.size) * 100)));
      }

      await postJson({ action: "complete", id });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(null);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async (attachment: PlanAttachment) => {
    if (
      !confirm(`Remove "${attachment.filename}" from this plan?`)
    ) {
      return;
    }
    setError("");
    try {
      await deletePlanAttachmentFn({ data: { id: attachment.id } });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the file.");
    }
  };

  return (
    <div data-testid="plan-attachments">
      <p className="text-sm text-gray-600 mb-3">
        Assessment graphs attached to this plan. PNG and JPG images are embedded
        in the PDF export; attached PDFs are appended to it. Up to{" "}
        {maxAttachments} files, 10 MB each.
      </p>

      {loading ? (
        <p className="text-sm text-gray-400">Loading attachments…</p>
      ) : attachments.length === 0 ? (
        <p className="text-sm text-gray-400" data-testid="attachments-empty">
          No assessment graphs attached.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100" data-testid="attachments-list">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center gap-3 py-2 text-sm"
            >
              <span className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">
                {typeLabel(a.mime_type)}
              </span>
              <a
                href={`/api/plan-attachments?id=${a.id}`}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-indigo-700 hover:underline break-all"
              >
                {a.filename}
              </a>
              <span className="text-xs text-gray-500 tabular-nums">
                {formatSize(a.byte_size)}
              </span>
              <span className="text-xs text-gray-400">
                {new Date(a.created_at).toLocaleDateString()}
                {a.uploaded_by_name ? ` · ${a.uploaded_by_name}` : ""}
              </span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => void remove(a)}
                  className="ml-auto text-xs font-medium text-red-600 hover:underline"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED}
            disabled={uploading !== null}
            data-testid="attachment-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
            className="block text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100"
          />
          <span className="text-xs text-gray-500 tabular-nums">
            {attachments.length} of {maxAttachments}
          </span>
        </div>
      )}

      {uploading && (
        <p className="mt-2 text-xs text-gray-600" data-testid="attachment-progress">
          Uploading {uploading}… {progress}%
        </p>
      )}
      {error && (
        <p className="mt-2 text-xs text-red-600" data-testid="attachment-error">
          {error}
        </p>
      )}
    </div>
  );
}
