// Assessments layout — wraps all /assessments/* routes
import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/assessments")({
  component: AssessmentsLayout,
});

function AssessmentsLayout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Outlet />
    </div>
  );
}
