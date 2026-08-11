import { SystemSettings } from '../components/system/SystemSettings';
import { M365UserRolesPanel } from '../components/system/M365UserRolesPanel';

export function SystemPage() {
  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto min-h-screen bg-canvas text-primary">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800/80 pb-6">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-tight text-primary">
            SYSTEM ADMIN
          </h1>
          <p className="text-xs font-normal text-muted mt-1">
            Microsoft 365 / Azure AD integration, SharePoint sync, and User RBAC permissions.
          </p>
        </div>
      </div>

      <div className="pt-2">
        <M365UserRolesPanel />
      </div>

      <div className="pt-2">
        <SystemSettings />
      </div>
    </div>
  );
}
