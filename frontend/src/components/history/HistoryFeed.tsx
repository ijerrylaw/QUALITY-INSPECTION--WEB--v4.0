import { useState } from 'react';
import { Search, Filter, Download } from 'lucide-react';
import { Button } from '../ui/Button';

// Mock Submissions
const MOCK_SUBMISSIONS = [
  {
    id: 'sub_001',
    lotNumber: 'K-L01-26214-A',
    sku: 'N035SKB-OC-24FT',
    productionDate: '2026-07-24',
    samplingTime: '08:15',
    sampleSize: 200,
    inspector: 'john.doe@oneglove.com',
    verdict: 'PASSED',
    amendmentStatus: 'UNMODIFIED'
  },
  {
    id: 'sub_002',
    lotNumber: 'K-L01-26214-B',
    sku: 'L050SWH-SM-18SM',
    productionDate: '2026-07-24',
    samplingTime: '10:45',
    sampleSize: 315,
    inspector: 'jane.smith@oneglove.com',
    verdict: 'FAILED',
    amendmentStatus: 'PENDING_APPROVAL'
  },
  {
    id: 'sub_003',
    lotNumber: 'I-L05-26214-A',
    sku: 'N040SBK-TX-24FT',
    productionDate: '2026-07-24',
    samplingTime: '13:20',
    sampleSize: 125,
    inspector: 'ahmad.z@oneglove.com',
    verdict: 'PASSED',
    amendmentStatus: 'APPROVED'
  }
];

export function HistoryFeed() {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredSubmissions = MOCK_SUBMISSIONS.filter(sub => 
    sub.lotNumber.toLowerCase().includes(searchTerm.toLowerCase()) || 
    sub.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-surface rounded-lg border border-gray-800">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input 
            type="text" 
            placeholder="Search by Lot Number or SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-12 pl-10 pr-4 bg-canvas border border-gray-700 rounded-lg text-sm text-primary focus:border-brand-primary outline-none transition-colors"
          />
        </div>
        
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Button variant="secondary" className="h-12 px-4 flex items-center gap-2 w-full sm:w-auto">
            <Filter className="w-4 h-4" />
            FILTER
          </Button>
          <Button variant="secondary" className="h-12 px-4 flex items-center gap-2 w-full sm:w-auto">
            <Download className="w-4 h-4" />
            EXPORT CSV
          </Button>
        </div>
      </div>

      {/* Datatable */}
      <div className="bg-surface border border-gray-800 rounded-lg overflow-x-auto shadow-sm">
        <table className="w-full text-left whitespace-nowrap">
          <thead>
            <tr>
              <th className="bg-canvas text-xs font-semibold uppercase tracking-wider text-muted py-3 px-4 border-b border-gray-800 text-left">
                Date & Time
              </th>
              <th className="bg-canvas text-xs font-semibold uppercase tracking-wider text-muted py-3 px-4 border-b border-gray-800 text-left">
                Lot Number
              </th>
              <th className="bg-canvas text-xs font-semibold uppercase tracking-wider text-muted py-3 px-4 border-b border-gray-800 text-left">
                Product SKU
              </th>
              <th className="bg-canvas text-xs font-semibold uppercase tracking-wider text-muted py-3 px-4 border-b border-gray-800 text-left">
                Sample Size
              </th>
              <th className="bg-canvas text-xs font-semibold uppercase tracking-wider text-muted py-3 px-4 border-b border-gray-800 text-left">
                Verdict
              </th>
              <th className="bg-canvas text-xs font-semibold uppercase tracking-wider text-muted py-3 px-4 border-b border-gray-800 text-left">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredSubmissions.length > 0 ? (
              filteredSubmissions.map((sub) => (
                <tr key={sub.id} className="hover:bg-white/5 transition-colors cursor-pointer group">
                  <td className="py-3.5 px-4 text-sm border-b border-gray-800/50 text-primary">
                    <div className="font-mono text-primary">{sub.productionDate}</div>
                    <div className="font-mono text-muted text-xs">{sub.samplingTime}</div>
                  </td>
                  <td className="py-3.5 px-4 text-sm border-b border-gray-800/50 text-primary font-mono">
                    {sub.lotNumber}
                  </td>
                  <td className="py-3.5 px-4 text-sm border-b border-gray-800/50 text-primary font-mono">
                    {sub.sku}
                  </td>
                  <td className="py-3.5 px-4 text-sm border-b border-gray-800/50 text-primary font-mono">
                    {sub.sampleSize}
                  </td>
                  <td className="py-3.5 px-4 text-sm border-b border-gray-800/50 text-primary">
                    {sub.verdict === 'PASSED' ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        PASS
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/30">
                        FAIL
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-sm border-b border-gray-800/50 text-primary">
                    {sub.amendmentStatus === 'UNMODIFIED' && (
                      <span className="text-xs font-medium text-muted">Original</span>
                    )}
                    {sub.amendmentStatus === 'PENDING_APPROVAL' && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/30">
                        PENDING
                      </span>
                    )}
                    {sub.amendmentStatus === 'APPROVED' && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold uppercase tracking-wider bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                        AMENDED
                      </span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted">
                  No records found matching "{searchTerm}"
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
