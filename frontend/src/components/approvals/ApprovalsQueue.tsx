import { useState } from 'react';
import { ShieldAlert, Check, X, ArrowRight, User } from 'lucide-react';
import { Button } from '../ui/Button';

// Mock Data for Pending Approvals
const MOCK_PENDING_APPROVALS = [
  {
    id: 'amend_101',
    submissionId: 'sub_002',
    lotNumber: 'K-L01-26214-B',
    sku: 'L050SWH-SM-18SM',
    requestedBy: 'jane.smith@oneglove.com',
    requestedAt: '2026-07-24T11:05:00Z',
    reason: 'Typo in Minor Visual count. Operator accidentally double tapped.',
    originalValues: {
      verdict: 'FAILED',
      defects: {
        'Minor Visual': 22,
        'Major Visual': 5
      }
    },
    proposedValues: {
      verdict: 'PASSED',
      defects: {
        'Minor Visual': 20,
        'Major Visual': 5
      }
    }
  },
  {
    id: 'amend_102',
    submissionId: 'sub_008',
    lotNumber: 'I-L05-26214-A',
    sku: 'N040SBK-TX-24FT',
    requestedBy: 'ahmad.z@oneglove.com',
    requestedAt: '2026-07-24T14:12:00Z',
    reason: 'Wrong SKU selected during wizard initialization.',
    originalValues: {
      verdict: 'PASSED',
      sku: 'N040SBK-TX-24FT',
      sampleSize: 125
    },
    proposedValues: {
      verdict: 'PASSED',
      sku: 'N035SKB-OC-24FT',
      sampleSize: 200
    }
  }
];

export function ApprovalsQueue() {
  const [approvals, setApprovals] = useState(MOCK_PENDING_APPROVALS);
  const [selectedAmend, setSelectedAmend] = useState<typeof MOCK_PENDING_APPROVALS[0] | null>(null);

  const handleAction = (id: string, _action: 'Approve' | 'Reject') => {
    setApprovals(prev => prev.filter(a => a.id !== id));
    setSelectedAmend(null);
    // In a real app, this would dispatch to an API, and useToast for feedback
  };

  if (approvals.length === 0) {
    return (
      <div className="bg-surface border border-gray-800 rounded-xl p-12 text-center">
        <ShieldAlert className="w-12 h-12 text-brand-secondary mx-auto mb-4 opacity-50" />
        <h3 className="text-xl font-bold text-primary uppercase">No Pending Approvals</h3>
        <p className="text-muted mt-2">All amendment requests have been processed.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Data Table */}
      <div className="bg-surface border border-gray-800 rounded-lg overflow-x-auto shadow-sm">
        <table className="w-full text-left whitespace-nowrap">
          <thead>
            <tr>
              <th className="bg-canvas text-xs font-semibold uppercase tracking-wider text-muted py-3 px-4 border-b border-gray-800 text-left">
                ID & Date
              </th>
              <th className="bg-canvas text-xs font-semibold uppercase tracking-wider text-muted py-3 px-4 border-b border-gray-800 text-left">
                Lot Number
              </th>
              <th className="bg-canvas text-xs font-semibold uppercase tracking-wider text-muted py-3 px-4 border-b border-gray-800 text-left">
                Requested By
              </th>
              <th className="bg-canvas text-xs font-semibold uppercase tracking-wider text-muted py-3 px-4 border-b border-gray-800 text-left">
                Status
              </th>
              <th className="bg-canvas text-xs font-semibold uppercase tracking-wider text-muted py-3 px-4 border-b border-gray-800 text-right">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {approvals.map((amend) => (
              <tr key={amend.id} className="hover:bg-white/5 transition-colors">
                <td className="py-3.5 px-4 text-sm border-b border-gray-800/50 text-primary">
                  <div className="font-mono text-primary">{amend.id}</div>
                  <div className="font-mono text-muted text-xs">{new Date(amend.requestedAt).toLocaleString()}</div>
                </td>
                <td className="py-3.5 px-4 text-sm border-b border-gray-800/50 text-primary font-mono font-bold">
                  {amend.lotNumber}
                </td>
                <td className="py-3.5 px-4 text-sm border-b border-gray-800/50 text-primary">
                  {amend.requestedBy}
                </td>
                <td className="py-3.5 px-4 text-sm border-b border-gray-800/50 text-primary">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/30">
                    PENDING
                  </span>
                </td>
                <td className="py-3.5 px-4 text-sm border-b border-gray-800/50 text-right">
                  <Button variant="primary" onClick={() => setSelectedAmend(amend)}>
                    Review Diff
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Diff Viewer Modal */}
      {selectedAmend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface border border-gray-800 rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200 flex flex-col">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-canvas/50">
              <div>
                <h3 className="text-lg font-semibold uppercase text-primary">Amendment Request</h3>
                <p className="text-sm font-mono text-muted mt-1">{selectedAmend.lotNumber} - {selectedAmend.id}</p>
              </div>
              <button 
                onClick={() => setSelectedAmend(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:bg-gray-800 hover:text-primary transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              
              {/* Reason */}
              <div className="p-4 border border-brand-secondary/30 bg-brand-primary/5 rounded-lg">
                <h4 className="text-xs font-bold text-brand-secondary uppercase tracking-widest mb-2 flex items-center gap-2">
                  <User className="w-4 h-4" /> Reason for Amendment
                </h4>
                <p className="text-sm text-primary italic">
                  "{selectedAmend.reason}"
                </p>
              </div>

              {/* Diff Viewer */}
              <div className="grid grid-cols-1 md:grid-cols-2 rounded-lg border border-gray-800 overflow-hidden">
                
                {/* Original */}
                <div className="p-6 bg-canvas/50 relative border-b md:border-b-0 md:border-r border-gray-800">
                  <h4 className="text-xs font-bold text-rose-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <X className="w-4 h-4" /> Original Submission
                  </h4>
                  <div className="space-y-4">
                    {Object.entries(selectedAmend.originalValues).map(([key, val]) => {
                      const isChanged = JSON.stringify(val) !== JSON.stringify((selectedAmend.proposedValues as any)[key]);
                      
                      return (
                        <div key={key} className={`p-3 rounded-lg border ${isChanged ? 'bg-rose-500/10 border-rose-500/30' : 'bg-surface border-gray-800'}`}>
                          <span className="block text-[10px] font-bold text-muted uppercase mb-1">{key}</span>
                          {typeof val === 'object' ? (
                            <pre className={`text-sm font-mono ${isChanged ? 'text-rose-400' : 'text-primary'}`}>
                              {JSON.stringify(val, null, 2)}
                            </pre>
                          ) : (
                            <span className={`text-lg font-mono font-bold ${isChanged ? 'text-rose-400' : 'text-primary'}`}>{val as string}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Proposed */}
                <div className="p-6 bg-canvas/50 relative">
                  <h4 className="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Check className="w-4 h-4" /> Proposed Amendment
                  </h4>
                  <div className="absolute top-1/2 -left-3 md:-left-4 -translate-y-1/2 w-6 h-6 md:w-8 md:h-8 rounded-full bg-surface border border-gray-800 flex items-center justify-center z-10 shadow-lg hidden md:flex">
                    <ArrowRight className="w-4 h-4 text-brand-secondary" />
                  </div>
                  
                  <div className="space-y-4">
                    {Object.entries(selectedAmend.proposedValues).map(([key, val]) => {
                      const isChanged = JSON.stringify(val) !== JSON.stringify((selectedAmend.originalValues as any)[key]);
                      
                      return (
                        <div key={key} className={`p-3 rounded-lg border ${isChanged ? 'bg-emerald-500/10 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'bg-surface border-gray-800'}`}>
                          <span className="block text-[10px] font-bold text-muted uppercase mb-1">{key}</span>
                          {typeof val === 'object' ? (
                            <pre className={`text-sm font-mono ${isChanged ? 'text-emerald-400' : 'text-primary'}`}>
                              {JSON.stringify(val, null, 2)}
                            </pre>
                          ) : (
                            <span className={`text-lg font-mono font-bold ${isChanged ? 'text-emerald-400' : 'text-primary'}`}>{val as string}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="p-6 border-t border-gray-800 flex justify-end gap-4 bg-canvas/30 rounded-b-lg">
              <Button variant="danger" className="px-8" onClick={() => handleAction(selectedAmend.id, 'Reject')}>
                REJECT
              </Button>
              <Button className="px-8 bg-emerald-600 hover:bg-emerald-500 text-white" onClick={() => handleAction(selectedAmend.id, 'Approve')}>
                APPROVE & MERGE
              </Button>
            </div>
            
          </div>
        </div>
      )}

    </div>
  );
}
