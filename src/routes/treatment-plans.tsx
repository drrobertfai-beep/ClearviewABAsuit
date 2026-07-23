// Treatment Plans layout — wraps all /treatment-plans/* routes
import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/treatment-plans")({
  component: TreatmentPlansLayout,
});

function TreatmentPlansLayout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Outlet />
    </div>
  );
}
