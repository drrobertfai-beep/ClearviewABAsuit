// ClearView ABA Suite — practice switcher (header)
//
// One login can belong to more than one practice. This is the control that moves
// the current SESSION between them; the server records the choice on the session
// row (sessions.active_practice_id), so every page then resolves that practice.
//
// Deliberately invisible for a single-practice account: with fewer than two
// active memberships it renders nothing at all.

import { useEffect, useRef, useState } from "react";

import { switchPracticeFn } from "~/server/practice-switch";
import type { SwitchablePractice } from "~/server/practice-switch";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  clinician: "Clinician",
  viewer: "Viewer",
};

export function PracticeSwitcher({
  practices,
  activePracticeId,
}: {
  practices: SwitchablePractice[];
  activePracticeId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close on an outside click / Escape, like any other menu.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (practices.length < 2) return null;

  const active =
    practices.find((p) => p.practiceId === activePracticeId) ?? practices[0];

  async function handleSwitch(practiceId: string) {
    if (practiceId === active.practiceId || busy) return;
    setBusy(practiceId);
    setError(null);
    try {
      await switchPracticeFn({ data: { practiceId } });
      setOpen(false);
      // A full reload is the honest way to drop every cached server payload:
      // after the session's practice changes, nothing from the old practice may
      // survive on screen. Lands on the dashboard of the new practice.
      window.location.assign("/");
    } catch (err) {
      setBusy(null);
      setError(
        err instanceof Error ? err.message : "Could not switch practice.",
      );
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="practice-switcher"
        className="inline-flex max-w-[16rem] items-center gap-2 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        title={`Practice: ${active.practiceName} (${ROLE_LABELS[active.practiceRole] ?? active.practiceRole})`}
      >
        <svg
          className="h-4 w-4 shrink-0 text-indigo-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"
          />
        </svg>
        <span className="truncate">{active.practiceName}</span>
        <svg
          className="h-3.5 w-3.5 shrink-0 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Switch practice"
          className="absolute right-0 z-20 mt-1 w-72 rounded-md border border-gray-200 bg-white py-1 shadow-lg"
        >
          <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Switch practice
          </p>
          {practices.map((practice) => {
            const isCurrent = practice.practiceId === active.practiceId;
            return (
              <button
                key={practice.practiceId}
                type="button"
                role="menuitem"
                disabled={isCurrent || busy !== null}
                onClick={() => handleSwitch(practice.practiceId)}
                data-testid={`practice-option-${practice.practiceId}`}
                className={
                  "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors " +
                  (isCurrent
                    ? "cursor-default bg-indigo-50 text-indigo-700"
                    : "text-gray-700 hover:bg-gray-50 disabled:opacity-50")
                }
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {practice.practiceName}
                  </span>
                  <span className="block text-xs text-gray-500">
                    {ROLE_LABELS[practice.practiceRole] ?? practice.practiceRole}
                    {isCurrent ? " · current" : ""}
                  </span>
                </span>
                {busy === practice.practiceId ? (
                  <svg
                    className="h-4 w-4 animate-spin text-indigo-600"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      className="opacity-25"
                    />
                    <path
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      fill="currentColor"
                      className="opacity-75"
                    />
                  </svg>
                ) : (
                  !isCurrent && (
                    <span className="text-xs font-medium text-indigo-600">
                      Switch
                    </span>
                  )
                )}
              </button>
            );
          })}
          {error && (
            <p className="px-3 py-2 text-xs text-red-600" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
