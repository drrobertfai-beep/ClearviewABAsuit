// /invite/$token — accept a practice invite.
//
// Works signed out AND signed in:
//   signed out → offers register / log in, carrying the token through the flow
//   signed in  → shows the practice name and offered role, then "Join practice"
//
// An expired, cancelled, already-used or unknown token gets the same plain
// "no longer valid" page — never a stack trace, never a hint about which.
//
// The invite is bound to the address it was issued for: the server refuses an
// acceptance from a different account, because joining a practice grants access
// to client records.

import { createFileRoute, Link, useParams, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { acceptPracticeInviteFn, getInviteInfoFn } from "~/server/practice-members";
import { logoutFn } from "~/server/auth";
import type { SafeUser } from "~/server/auth";

export const Route = createFileRoute("/invite/$token")({
  head: () => ({
    meta: [
      { title: "Practice invite · ClearView ABA Suite" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InvitePage,
});

type InviteInfo = Awaited<ReturnType<typeof getInviteInfoFn>>;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}

function InvalidInvite() {
  return (
    <Shell>
      <div className="rounded-lg bg-white p-8 text-center shadow ring-1 ring-black/5">
        <h1 className="text-lg font-semibold text-gray-900">
          This invite is no longer valid
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          The link may have expired, already been used, or been cancelled. Ask a
          practice owner to send you a new invite.
        </p>
        <Link
          to="/login"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
        >
          Go to sign in
        </Link>
      </div>
    </Shell>
  );
}

function InvitePage() {
  const { token } = useParams({ from: "/invite/$token" });
  const ctx = Route.useRouteContext() as { user?: SafeUser | null };
  const user = ctx.user ?? null;
  const router = useRouter();

  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await getInviteInfoFn({ data: { token } });
        if (!cancelled) setInfo(result);
      } catch {
        if (!cancelled) setInfo({ valid: false, status: "unknown" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <Shell>
        <p className="text-center text-sm text-gray-500">Checking your invite…</p>
      </Shell>
    );
  }

  if (!info || !info.valid) return <InvalidInvite />;

  const emailMatches =
    user !== null && user.email.toLowerCase() === info.email.toLowerCase();

  async function handleJoin() {
    setJoining(true);
    setError("");
    try {
      const result = await acceptPracticeInviteFn({ data: { token } });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // The session's practice is resolved per request, so refresh the router
      // context and land on the dashboard of the practice just joined.
      await router.invalidate();
      await router.navigate({ to: "/" });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not join the practice.",
      );
    } finally {
      setJoining(false);
    }
  }

  async function handleSwitchAccount() {
    try {
      await logoutFn();
    } catch {
      // ignore — navigate either way
    }
    await router.invalidate();
  }

  return (
    <Shell>
      <div className="rounded-lg bg-white p-8 shadow ring-1 ring-black/5">
        <h1 className="text-lg font-semibold text-gray-900">
          Join {info.practiceName}
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          You've been invited to work in{" "}
          <span className="font-medium text-gray-900">{info.practiceName}</span> on
          ClearView ABA Suite as a{" "}
          <span className="font-medium text-gray-900">{info.role}</span>.
        </p>
        <dl className="mt-4 space-y-1 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-gray-500">Practice</dt>
            <dd className="font-medium text-gray-900">{info.practiceName}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-gray-500">Role</dt>
            <dd className="font-medium text-gray-900">{info.role}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-gray-500">Invited address</dt>
            <dd className="font-medium text-gray-900">{info.email}</dd>
          </div>
        </dl>

        {error && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {!user ? (
          <div className="mt-6 space-y-3">
            <Link
              to="/register"
              search={{ invite: token }}
              className="flex w-full items-center justify-center rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
            >
              Create an account to join
            </Link>
            <Link
              to="/login"
              search={{ invite: token }}
              className="flex w-full items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
            >
              I already have an account
            </Link>
            <p className="text-center text-xs text-gray-500">
              Use the address this invite was sent to ({info.email}) — the link
              only works for that account.
            </p>
          </div>
        ) : emailMatches ? (
          <div className="mt-6 space-y-3">
            <button
              type="button"
              onClick={handleJoin}
              disabled={joining}
              className="flex w-full items-center justify-center rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
            >
              {joining ? "Joining…" : "Join practice"}
            </button>
            <p className="text-center text-xs text-gray-500">
              Signed in as {user.email}
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              This invite was issued for{" "}
              <span className="font-medium">{info.email}</span>, but you are signed
              in as <span className="font-medium">{user.email}</span>.
            </div>
            <button
              type="button"
              onClick={handleSwitchAccount}
              className="flex w-full items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
            >
              Sign in with a different account
            </button>
          </div>
        )}
      </div>
      <p className="mt-4 text-center text-xs text-gray-400">
        This invite link is single use and expires 14 days after it was created.
      </p>
    </Shell>
  );
}
