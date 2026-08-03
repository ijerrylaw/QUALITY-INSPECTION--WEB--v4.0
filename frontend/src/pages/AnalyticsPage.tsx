import { AnalyticsDashboard } from '../components/analytics/AnalyticsDashboard';

export function AnalyticsPage() {
  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto min-h-screen bg-canvas text-primary">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800/80 pb-6">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-tight text-primary">
            QUALITY ANALYTICS
          </h1>
          <p className="text-xs font-normal text-muted mt-1">
            Dynamic Pareto charts, defect trends, and plant comparison metrics.
          </p>
        </div>
      </div>

      <div className="pt-2">
        <AnalyticsDashboard />
      </div>
    </div>
  );
}
