// ClearView ABA Suite — Plan attachment bytes: GET/POST /api/plan-attachments
//
// The ONLY way an attached assessment graph is read. There is no public file URL:
// the handler resolves the caller's practice from the session cookie and looks the
// row up inside that practice, so an id belonging to another practice is a 404.
//
//   GET  /api/plan-attachments?id=<attachmentId>   -> the file, inline
//   POST /api/plan-attachments                     -> JSON, one of:
//        { action: "init", planId, filename, mimeType, byteSize } -> { id }
//        { action: "chunk", id, data }        (base64)             -> { received }
//        { action: "complete", id }                                -> { attachment }
//
// Uploads are chunked because the production host rejects a request body much
// smaller than the 10 MB a single attachment may be; each chunk is appended to
// the row inside the same UPDATE that re-checks the cap.
//
// Both directions are audit-logged: "complete" writes a CREATE entry and every
// successful GET writes a READ entry.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/plan-attachments")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { requireSessionForRequest } = await import("~/server/auth-guard");
        const {
          getPlanAttachmentBytes,
          auditAttachmentDownload,
        } = await import("~/db");

        let ctx;
        try {
          ctx = await requireSessionForRequest(request);
        } catch {
          return new Response("Authentication required.", {
            status: 401,
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        }

        const id = new URL(request.url).searchParams.get("id") ?? "";
        if (!id) return new Response("Not found", { status: 404 });

        const attachment = await getPlanAttachmentBytes(ctx.practiceId, id);
        if (!attachment) return new Response("Not found", { status: 404 });

        await auditAttachmentDownload(
          ctx.practiceId,
          attachment,
          ctx.user.email,
        );

        const bytes = Buffer.from(attachment.data_base64, "base64");
        // `attachment.filename` is user-supplied; strip anything that could break
        // out of the quoted header value.
        const safeName = attachment.filename.replace(/["\\\r\n]/g, "_");
        return new Response(new Uint8Array(bytes), {
          status: 200,
          headers: {
            "content-type": attachment.mime_type,
            "content-length": String(bytes.length),
            "content-disposition": `inline; filename="${safeName}"`,
            // Never cached by a proxy: this is PHI behind a session.
            "cache-control": "private, no-store, max-age=0",
            "x-content-type-options": "nosniff",
          },
        });
      },

      POST: async ({ request }) => {
        const {
          requireSessionForRequest,
          assertPracticeWritable,
        } = await import("~/server/auth-guard");
        const {
          startPlanAttachment,
          appendPlanAttachmentChunk,
          completePlanAttachment,
          isAllowedMime,
          MAX_ATTACHMENT_BYTES,
        } = await import("~/db");

        const fail = (message: string, status = 400) =>
          Response.json({ error: message }, { status });

        let ctx;
        try {
          ctx = await requireSessionForRequest(request);
        } catch {
          return fail("Authentication required.", 401);
        }

        // Viewers may read a plan but never change what is attached to it.
        if (!["owner", "admin", "clinician"].includes(ctx.practiceRole)) {
          return fail("You do not have permission to perform this action.", 403);
        }

        // Same-origin only: a cross-site form post must not be able to add a file.
        const origin = request.headers.get("origin");
        if (origin) {
          const host = request.headers.get("host");
          let originHost = "";
          try {
            originHost = new URL(origin).host;
          } catch {
            originHost = "";
          }
          if (!host || originHost !== host) {
            return fail("Cross-site upload refused.", 403);
          }
        }

        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return fail("Malformed request body.");
        }

        try {
          await assertPracticeWritable(ctx.practiceId);

          const action = String(body.action ?? "");

          if (action === "init") {
            const mimeType = String(body.mimeType ?? "");
            if (!isAllowedMime(mimeType)) {
              return fail("Only PNG, JPG and PDF files can be attached.");
            }
            const byteSize = Number(body.byteSize ?? 0);
            if (byteSize > MAX_ATTACHMENT_BYTES) {
              return fail("Each attachment must be 10 MB or smaller.", 413);
            }
            const { id } = await startPlanAttachment(
              ctx.practiceId,
              String(body.planId ?? ""),
              {
                filename: String(body.filename ?? "attachment"),
                mimeType,
                byteSize,
              },
              ctx.user.id,
            );
            return Response.json({ id });
          }

          if (action === "chunk") {
            const data = String(body.data ?? "");
            if (!data) return fail("Empty chunk.");
            const received = await appendPlanAttachmentChunk(
              ctx.practiceId,
              String(body.id ?? ""),
              data,
            );
            return Response.json({ received });
          }

          if (action === "complete") {
            const attachment = await completePlanAttachment(
              ctx.practiceId,
              String(body.id ?? ""),
              ctx.user.email,
            );
            return Response.json({ attachment });
          }

          return fail("Unknown action.");
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Upload failed.";
          const status = /10 MB/.test(message)
            ? 413
            : /not found|no longer open/i.test(message)
              ? 404
              : 400;
          return fail(message, status);
        }
      },
    },
  },
});
