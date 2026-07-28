import { SystemSettings } from '../components/system/SystemSettings';

export function SystemPage() {
  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold uppercase tracking-tight text-primary">
          SYSTEM & TENANT ADMIN
        </h1>
        <p className="text-sm font-normal text-muted mt-1">
          Microsoft 365 / Azure AD integration, SharePoint sync, and User RBAC permissions.
        </p>
      </div>

      <div className="pt-2">
        <SystemSettings />
      </div>
    </div>
  );
}
