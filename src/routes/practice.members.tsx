// /practice/members — who is in this practice, at what level, and how to invite
// a colleague.
//
// Visible to every member of the practice (read-only for clinicians/viewers);
// the invite form, role controls and remove buttons render only for owner/admin
// and are enforced again on the server.
//
// There is NO outbound email in this app. An invite is a link the owner copies
// and sends themselves — nothing on this page claims an email was sent.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  cancelPracticeInviteFn,
  changeMemberRoleFn,
  createPracticeInviteFn,
  getPracticeMembersFn,
  removePracticeMemberFn,
} from "~/server/practice-members";
import { clientLimitLabel, planLimits } from "~/lib/plans";

export const Route = createFileRoute("/practice/members")({
  head: () => ({
    meta: [
      { title: "Practice members · ClearView ABA Suite" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PracticeMembersPage,
});

type MembersData = Awaited<ReturnType<typeof getPracticeMembersFn>>;

const ROLE_HELP: Record<string, string> = {
  owner: "Manages members, billing, and all clinical work.",
  admin: "Manages members and billing, and all clinical work.",
  clinician: "Full clinical work: clients, assessments, treatment plans, signatures.",
  viewer: "Read-only: can see clients and plans, cannot create, edit, sign or delete.",
};

const ROLE_ORDER = ["owner", "admin", "clinician", "viewer"] as const;

/** Public base URL for invite links — the domain the owner actually shares. */
const INVITE_BASE = "https://getclearviewaba.com";

function inviteUrl(token: string): string {
  return `${INVITE_BASE}/invite/${token}`;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function roleBadgeClasses(role: string): string {
  switch (role) {
    case "owner":
      return "bg-indigo-100 text-indigo-700";
    case "admin":
      return "bg-purple-100 text-purple-700";
    case "clinician":
      return "bg-emerald-100 text-emerald-700";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

/** Copy helper that works on http (dev) as well as https (prod). */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

function PracticeMembersPage() {
  const [data, setData] = useState<MembersData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(
    null,
  );

  // Invite form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("clinician");
  const [freshInvite, setFreshInvite] = useState<{
    email: string;
    role: string;
    url: string;
  } | null>(null);

  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const result = await getPracticeMembersFn();
      setData(result);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Could not load practice members.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const limits = useMemo(
    () => planLimits(data?.practice.plan ?? null),
    [data?.practice.plan],
  );

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return;
    setBusy(true);
    setNotice(null);
    setFreshInvite(null);
    try {
      const result = await createPracticeInviteFn({
        data: { email: inviteEmail, role: inviteRole },
      });
      if (!result.ok) {
        setNotice({ kind: "error", text: result.error });
      } else {
        setFreshInvite({
          email: result.invite.email,
          role: result.invite.role,
          url: inviteUrl(result.invite.token),
        });
        setInviteEmail("");
        setNotice({
          kind: "ok",
          text: result.replacedPending
            ? "Invite link created — this replaced the previous pending invite for that address."
            : "Invite link created.",
        });
        await load();
      }
    } catch (err) {
      setNotice({
        kind: "error",
        text: err instanceof Error ? err.message : "Could not create the invite.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy(text: string, key: string) {
    const ok = await copyText(text);
    setCopied(ok ? key : null);
    setNotice(
      ok
        ? { kind: "ok", text: "Invite link copied to your clipboard." }
        : { kind: "error", text: "Could not copy — select the link and copy it manually." },
    );
    if (ok) setTimeout(() => setCopied(null), 2500);
  }

  async function handleRoleChange(userId: string, role: string) {
    setBusy(true);
    setNotice(null);
    try {
      const result = await changeMemberRoleFn({ data: { userId, role } });
      if (!result.ok) setNotice({ kind: "error", text: result.error });
      else {
        setNotice({ kind: "ok", text: "Role updated." });
        await load();
      }
    } catch (err) {
      setNotice({
        kind: "error",
        text: err instanceof Error ? err.message : "Could not change the role.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(userId: string, name: string) {
    if (
      !window.confirm(
        `Remove ${name} from this practice? They lose access immediately.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const result = await removePracticeMemberFn({ data: { userId } });
      if (!result.ok) setNotice({ kind: "error", text: result.error });
      else {
        setNotice({ kind: "ok", text: `${name} was removed from the practice.` });
        await load();
      }
    } catch (err) {
      setNotice({
        kind: "error",
        text: err instanceof Error ? err.message : "Could not remove the member.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleCancelInvite(id: string, email: string) {
    setBusy(true);
    setNotice(null);
    try {
      const result = await cancelPracticeInviteFn({ data: { id } });
      if (!result.ok) setNotice({ kind: "error", text: result.error });
      else {
        setNotice({ kind: "ok", text: `Invite for ${email} cancelled.` });
        await load();
      }
    } catch (err) {
      setNotice({
        kind: "error",
        text: err instanceof Error ? err.message : "Could not cancel the invite.",
      });
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <p className="text-sm text-gray-500">Loading practice members…</p>
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-5">
          <h1 className="text-base font-semibold text-red-900">
            Could not load practice members
          </h1>
          <p className="mt-1 text-sm text-red-800">
            {loadError || "Please try again."}
          </p>
        </div>
      </div>
    );
  }

  const { practice, me, canManage, seat, members, invites } = data;
  const seatsFull = !seat.available;
  const owners = members.filter((m) => m.role === "owner").length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Practice members
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {practice.name} ·{" "}
            <span className="font-medium text-gray-700">{practice.planName} plan</span>
          </p>
          <p className="mt-2 text-sm text-gray-600">
            <span className="font-semibold text-gray-900">{seat.usageLabel}</span>
            {seat.pending > 0 && (
              <span className="text-gray-500">
                {" "}
                ({seat.pending} pending invite{seat.pending === 1 ? "" : "s"})
              </span>
            )}
            {" · "}
            {clientLimitLabel(limits.clientLimit)}
          </p>
        </div>
        <Link
          to="/billing"
          className="inline-flex flex-shrink-0 items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
        >
          Manage plan
        </Link>
      </div>

      {notice && (
        <div
          role="status"
          className={`mb-6 rounded-md border p-4 text-sm ${
            notice.kind === "ok"
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {notice.text}
        </div>
      )}

      {/* Invite — owner/admin only */}
      {canManage && (
        <section className="mb-8 rounded-lg bg-white p-6 shadow ring-1 ring-black/5">
          <h2 className="text-base font-semibold text-gray-900">
            Invite a practitioner
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Creates a link you copy and send yourself — this app does not send
            email. The link works for {14} days and can only be used once.
          </p>

          <form onSubmit={handleInvite} className="mt-4 flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <label htmlFor="invite-email" className="sr-only">
                Email address
              </label>
              <input
                id="invite-email"
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@clinic.com"
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="invite-role" className="sr-only">
                Role
              </label>
              <select
                id="invite-role"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:w-44"
              >
                <option value="clinician">Clinician</option>
                <option value="admin">Admin</option>
                <option value="viewer">Viewer (read-only)</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={busy || seatsFull}
              className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Create invite link
            </button>
          </form>

          {seatsFull && (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              All seats on the {practice.planName} plan are in use
              {seat.limit === null ? "" : ` (${seat.used} of ${seat.limit})`}. Upgrade
              the plan to invite another practitioner.
            </p>
          )}

          <p className="mt-3 text-xs text-gray-500">
            {ROLE_HELP[inviteRole]}
          </p>

          {freshInvite && (
            <div className="mt-5 rounded-md border border-indigo-200 bg-indigo-50 p-4">
              <p className="text-sm font-semibold text-indigo-900">
                Invite link for {freshInvite.email} ({freshInvite.role})
              </p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  readOnly
                  value={freshInvite.url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full flex-1 rounded-md border border-indigo-200 bg-white px-3 py-2 text-xs text-gray-700"
                  aria-label="Invite link"
                />
                <button
                  type="button"
                  onClick={() => handleCopy(freshInvite.url, "fresh")}
                  className="inline-flex flex-shrink-0 items-center justify-center rounded-md bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
                >
                  {copied === "fresh" ? "Copied" : "Copy link"}
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                <a
                  href={`mailto:${freshInvite.email}?subject=${encodeURIComponent(
                    `You're invited to ${practice.name} on ClearView ABA Suite`,
                  )}&body=${encodeURIComponent(
                    `I've added you to ${practice.name} on ClearView ABA Suite as a ${freshInvite.role}. Open this link to join:\n\n${freshInvite.url}\n\nThe link expires in 14 days and can only be used once.`,
                  )}`}
                  className="font-medium text-indigo-700 underline-offset-2 hover:underline"
                >
                  Open in your email app
                </a>
                <span className="text-indigo-700/70">
                  Sends from your own mailbox — ClearView does not email the invite.
                </span>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Members */}
      <section className="mb-8 overflow-hidden rounded-lg bg-white shadow ring-1 ring-black/5">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">
            Members ({members.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Joined
                </th>
                {canManage && (
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {members.map((member) => {
                const isMe = member.userId === me.userId;
                const isLastOwner = member.role === "owner" && owners <= 1;
                // An admin can never act on an owner; nobody can act on the last owner.
                const blockedByActor =
                  me.role === "admin" && member.role === "owner";
                const canDemote = !blockedByActor && !isLastOwner;
                const canRemove = canDemote;
                return (
                  <tr key={member.userId}>
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                      {member.name}
                      {isMe && (
                        <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-normal text-gray-600">
                          you
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                      {member.email}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm">
                      {canManage && canDemote ? (
                        <select
                          value={member.role}
                          disabled={busy}
                          onChange={(e) =>
                            handleRoleChange(member.userId, e.target.value)
                          }
                          aria-label={`Role for ${member.name}`}
                          className="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          {ROLE_ORDER.filter(
                            (role) => role !== "owner" || me.role === "owner",
                          ).map((role) => (
                            <option key={role} value={role}>
                              {role.charAt(0).toUpperCase() + role.slice(1)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${roleBadgeClasses(member.role)}`}
                          title={ROLE_HELP[member.role]}
                        >
                          {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      {formatDate(member.joinedAt)}
                    </td>
                    {canManage && (
                      <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                        {canRemove ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleRemove(member.userId, member.name)}
                            className="font-medium text-red-600 hover:text-red-500 disabled:opacity-50"
                          >
                            Remove
                          </button>
                        ) : (
                          <span
                            className="text-xs text-gray-400"
                            title={
                              isLastOwner
                                ? "The last owner cannot be removed or demoted."
                                : "An admin cannot remove an owner."
                            }
                          >
                            {isLastOwner ? "Last owner" : "Owner"}
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-gray-100 px-6 py-3">
          <p className="text-xs text-gray-500">
            Roles: <strong>Owner</strong> and <strong>Admin</strong> manage members
            and billing; <strong>Clinician</strong> does all clinical work;{" "}
            <strong>Viewer</strong> is read-only.
          </p>
        </div>
      </section>

      {/* Pending invites */}
      {canManage && (
        <section className="overflow-hidden rounded-lg bg-white shadow ring-1 ring-black/5">
          <div className="border-b border-gray-100 px-6 py-4">
            <h2 className="text-base font-semibold text-gray-900">
              Pending invites ({invites.length})
            </h2>
          </div>
          {invites.length === 0 ? (
            <p className="px-6 py-6 text-sm text-gray-500">
              No pending invites. Invites you create appear here until they are
              accepted or expire.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {invites.map((invite) => {
                const url = inviteUrl(invite.token);
                return (
                  <li
                    key={invite.id}
                    className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {invite.email}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {invite.role.charAt(0).toUpperCase() + invite.role.slice(1)} ·
                        created {formatDate(invite.createdAt)} · expires{" "}
                        {formatDate(invite.expiresAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopy(url, invite.id)}
                        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        {copied === invite.id ? "Copied" : "Copy link"}
                      </button>
                      <a
                        href={`mailto:${invite.email}?subject=${encodeURIComponent(
                          `You're invited to ${practice.name} on ClearView ABA Suite`,
                        )}&body=${encodeURIComponent(
                          `Open this link to join ${practice.name}:\n\n${url}\n`,
                        )}`}
                        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        Email link
                      </a>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleCancelInvite(invite.id, invite.email)}
                        className="rounded-md px-3 py-1.5 text-xs font-semibold text-red-600 hover:text-red-500 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {!canManage && (
        <p className="text-sm text-gray-500">
          Only practice owners and admins can invite, change roles or remove
          members.
        </p>
      )}
    </div>
  );
}
