import { ApprovalsQueue } from '../components/approvals/ApprovalsQueue';

export function ApprovalsPage() {
  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto min-h-screen bg-canvas text-primary">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800/80 pb-6">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-tight text-primary">
            APPROVALS QUEUE
          </h1>
          <p className="text-xs font-normal text-muted mt-1">
            Executive side-by-side diff viewer for pending amendment requests.
          </p>
        </div>
      </div>

      <div className="pt-2">
        <ApprovalsQueue />
      </div>
    </div>
  );
}
