import { HistoryFeed } from '../components/history/HistoryFeed';

export function HistoryPage() {
  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold uppercase tracking-tight text-primary">
          INSPECTION RECORDS
        </h1>
        <p className="text-sm font-normal text-muted mt-1">
          Historical log of past AQL batch inspections and audit receipts.
        </p>
      </div>

      <div className="pt-2">
        <HistoryFeed />
      </div>
    </div>
  );
}
