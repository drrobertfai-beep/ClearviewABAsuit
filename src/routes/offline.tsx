import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/offline")({
  component: OfflinePage,
});

function OfflinePage() {
  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="text-center max-w-md">
        {/* Icon */}
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-indigo-100">
          <svg
            className="h-10 w-10 text-indigo-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M18.364 5.636a9 9 0 0 1 0 12.728m-2.829-2.829a5 5 0 0 1 0-7.07m-8.485 0a5 5 0 0 1 0 7.07m-2.828 2.829a9 9 0 0 1 0-12.728"
            />
            <line
              x1="12"
              y1="9"
              x2="12"
              y2="15"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
            />
          </svg>
        </div>

        {/* Heading */}
        <h1 className="text-2xl font-bold text-gray-900">You&rsquo;re Offline</h1>
        <p className="mt-3 text-gray-500 leading-relaxed">
          Please check your internet connection and try again. Some features may be
          unavailable until you reconnect.
        </p>

        {/* Retry button */}
        <button
          onClick={() => window.location.reload()}
          className="mt-6 inline-flex items-center gap-2 rounded-md bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors shadow-sm"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182"
            />
          </svg>
          Retry
        </button>

        {/* Cached pages hint */}
        <p className="mt-8 text-sm text-gray-400">
          If you&rsquo;ve visited pages before going offline, they may still be
          available from your browser cache.
        </p>
      </div>
    </div>
  );
}
