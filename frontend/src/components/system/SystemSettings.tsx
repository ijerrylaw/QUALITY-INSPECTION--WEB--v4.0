import { useState } from 'react';
import { Save, RefreshCw, Key, Cloud, Database, ShieldCheck } from 'lucide-react';
import { Button } from '../ui/Button';
import { useToast } from '../ui/ToastProvider';

export function SystemSettings() {
  const { addToast } = useToast();
  const [isTesting, setIsTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');

  const handleTestConnection = () => {
    setIsTesting(true);
    setConnectionStatus('testing');
    
    // Mock API Call
    setTimeout(() => {
      setIsTesting(false);
      setConnectionStatus('success');
      addToast('success', 'Successfully authenticated with Microsoft Graph API.');
    }, 1500);
  };

  const handleSave = () => {
    addToast('success', 'System configuration securely saved.');
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Overview Card */}
      <div className="bg-surface border border-gray-800 rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h3 className="text-xl font-bold text-primary uppercase flex items-center gap-2">
            <Cloud className="w-6 h-6 text-brand-secondary" />
            Enterprise Data Sync
          </h3>
          <p className="text-sm text-muted mt-2 max-w-2xl">
            Configure the Microsoft 365 Azure AD credentials used by the backend Node.js engine to synchronize completed AQL inspections and amendment logs directly into the corporate SharePoint ecosystem.
          </p>
        </div>
        
        <div className="flex flex-col gap-2 min-w-[200px]">
          <div className="bg-canvas border border-gray-800 rounded-lg p-3 flex items-center justify-between">
            <span className="text-xs font-bold text-muted uppercase tracking-wider">Sync Status</span>
            {connectionStatus === 'success' ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                CONNECTED
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                OFFLINE
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Azure AD Credentials Form */}
        <div className="bg-surface border border-gray-800 rounded-xl shadow-sm overflow-hidden">
          <div className="bg-canvas border-b border-gray-800 p-6 flex items-center gap-3">
            <Key className="w-5 h-5 text-brand-primary" />
            <h3 className="text-lg font-bold text-primary uppercase">Azure AD Authentication</h3>
          </div>
          
          <div className="p-6 space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted">Tenant ID</label>
              <input 
                type="text" 
                defaultValue="8x92a3b1-4f77-4a00-9112-9b8c7d6e5f4a"
                className="w-full bg-canvas border border-gray-700 text-sm font-mono text-primary rounded-lg px-4 py-2.5 focus:border-brand-primary outline-none"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted">Client ID (Application ID)</label>
              <input 
                type="text" 
                defaultValue="1a2b3c4d-5e6f-7g8h-9i0j-1k2l3m4n5o6p"
                className="w-full bg-canvas border border-gray-700 text-sm font-mono text-primary rounded-lg px-4 py-2.5 focus:border-brand-primary outline-none"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted">Client Secret</label>
              <input 
                type="password" 
                defaultValue="********************************"
                className="w-full bg-canvas border border-gray-700 text-sm font-mono text-primary rounded-lg px-4 py-2.5 focus:border-brand-primary outline-none"
              />
              <p className="text-xs text-muted mt-1">Stored securely in backend environment variables.</p>
            </div>
          </div>
        </div>

        {/* SharePoint Configuration Form */}
        <div className="bg-surface border border-gray-800 rounded-xl shadow-sm overflow-hidden flex flex-col justify-between">
          <div>
            <div className="bg-canvas border-b border-gray-800 p-6 flex items-center gap-3">
              <Database className="w-5 h-5 text-brand-secondary" />
              <h3 className="text-lg font-bold text-primary uppercase">SharePoint Destination</h3>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted">SharePoint Site URL</label>
                <input 
                  type="text" 
                  defaultValue="https://oneglove.sharepoint.com/sites/QualityAssurance"
                  className="w-full bg-canvas border border-gray-700 text-sm text-primary rounded-lg px-4 py-2.5 focus:border-brand-primary outline-none"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted">Target List Name</label>
                <input 
                  type="text" 
                  defaultValue="IPQA_Master_Data"
                  className="w-full bg-canvas border border-gray-700 text-sm text-primary rounded-lg px-4 py-2.5 focus:border-brand-primary outline-none"
                />
              </div>

              <div className="bg-brand-primary/10 border border-brand-primary/30 rounded-lg p-4 flex gap-3 mt-4">
                <ShieldCheck className="w-5 h-5 text-brand-primary shrink-0" />
                <p className="text-sm text-brand-secondary">
                  Ensure the Azure AD Application has `Sites.ReadWrite.All` API permissions granted via Microsoft Graph.
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 bg-canvas/30 border-t border-gray-800 flex justify-end gap-4">
            <Button 
              variant="secondary" 
              className="px-6 flex items-center gap-2"
              onClick={handleTestConnection}
              disabled={isTesting}
            >
              <RefreshCw className={`w-4 h-4 ${isTesting ? 'animate-spin' : ''}`} /> 
              {isTesting ? 'TESTING...' : 'TEST CONNECTION'}
            </Button>
            <Button className="px-8 flex items-center gap-2" onClick={handleSave}>
              <Save className="w-4 h-4" /> SAVE CONFIG
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
}
