// Clients layout — wraps all /clients/* routes
import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/clients")({
  component: ClientsLayout,
});

function ClientsLayout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Outlet />
    </div>
  );
}
