/**
 * @file InspectionRules.tsx
 * @description Inspection Rules & Matrix Configuration Component.
 *
 * Unified grid for managing AQL Inspection Profiles, Categories, and Defect Definitions.
 * Uses mock state until the backend Profile API is implemented.
 *
 * Strict Compliance with UI_DESIGN_SYSTEM.md:
 *  - bg-surface for cards, border-gray-800 for borders.
 *  - text-lg font-semibold uppercase text-primary for sub-headers.
 *  - JetBrains Mono (font-mono) for all numerical AQL limits.
 */

import { useState } from 'react';
import { ShieldCheck, Plus, Settings2, GitMerge, AlertTriangle } from 'lucide-react';

// --- MOCK DATA ---
interface MockDefectDefinition {
  id: string;
  name: string;
  description: string;
  categoryId: string; // References MockAQLCategory.id
}
interface MockAQLCategory {
  id: string;
  name: string;
  aqlLevel: string;
  evaluationMode: 'CUMULATIVE' | 'GRANULAR';
}

interface MockInspectionProfile {
  id: string;
  name: string;
  isDefault: boolean;
  categories: MockAQLCategory[];
  defects: MockDefectDefinition[];
}

const MOCK_PROFILES: MockInspectionProfile[] = [
  {
    id: 'prof_default_01',
    name: 'GLOBAL STANDARD ISO 2859-1',
    isDefault: true,
    categories: [
      { id: 'cat_1', name: 'BARRIER DEFECTS', aqlLevel: 'AND (Zero Tolerance)', evaluationMode: 'GRANULAR' },
      { id: 'cat_2', name: 'CRITICAL VISUAL', aqlLevel: '0.65', evaluationMode: 'CUMULATIVE' },
      { id: 'cat_3', name: 'MAJOR VISUAL', aqlLevel: '2.5', evaluationMode: 'CUMULATIVE' },
      { id: 'cat_4', name: 'MINOR VISUAL', aqlLevel: '4.0', evaluationMode: 'CUMULATIVE' },
    ],
    defects: [
      { id: 'def_1', name: 'Hole / Tear', description: 'Any breach in the glove barrier.', categoryId: 'cat_1' },
      { id: 'def_2', name: 'Foreign Particle', description: 'Embedded dirt or particulate > 1mm.', categoryId: 'cat_2' },
      { id: 'def_3', name: 'Stain', description: 'Visible discoloration.', categoryId: 'cat_3' },
      { id: 'def_4', name: 'Poor Cuff Roll', description: 'Unrolled or loose cuff.', categoryId: 'cat_4' },
    ]
  },
  {
    id: 'prof_custom_02',
    name: 'ANSELL STRICT RULES',
    isDefault: false,
    categories: [
      { id: 'cat_5', name: 'BARRIER DEFECTS', aqlLevel: 'AND (Zero Tolerance)', evaluationMode: 'GRANULAR' },
      { id: 'cat_6', name: 'CRITICAL VISUAL', aqlLevel: '0.40', evaluationMode: 'CUMULATIVE' },
      { id: 'cat_7', name: 'MAJOR VISUAL', aqlLevel: '1.5', evaluationMode: 'CUMULATIVE' },
    ],
    defects: [
      { id: 'def_5', name: 'Hole / Tear', description: 'Any breach in the glove barrier.', categoryId: 'cat_5' },
      { id: 'def_6', name: 'Foreign Particle', description: 'Any embedded particulate.', categoryId: 'cat_6' },
    ]
  }
];

export function InspectionRules() {
  const [profiles] = useState<MockInspectionProfile[]>(MOCK_PROFILES);
  const [activeProfileId, setActiveProfileId] = useState<string>(MOCK_PROFILES[0].id);

  const activeProfile = profiles.find((p) => p.id === activeProfileId) || profiles[0];

  return (
    <div className="space-y-6">
      
      {/* ── Top Control Bar: Profile Selection ────────────────────────────── */}
      <div className="bg-surface border border-gray-800 rounded-lg p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-brand-secondary" strokeWidth={2} />
            ACTIVE INSPECTION PROFILE
          </h2>
          <div className="flex flex-wrap gap-2 mt-1">
            {profiles.map((profile) => (
              <button
                key={profile.id}
                onClick={() => setActiveProfileId(profile.id)}
                className={`h-12 px-4 rounded-lg text-sm font-semibold uppercase tracking-wide border transition-all outline-none flex items-center gap-2 ${
                  activeProfileId === profile.id
                    ? 'bg-brand-primary text-white border-brand-secondary shadow-md'
                    : 'bg-canvas text-muted border-gray-700 hover:border-gray-500 hover:text-primary'
                }`}
              >
                {profile.name}
                {profile.isDefault && (
                  <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    DEFAULT
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <button className="h-12 px-4 rounded-lg bg-surface text-brand-secondary border border-gray-700 hover:border-brand-secondary/50 font-semibold text-xs uppercase tracking-wider flex items-center gap-2 transition-all outline-none whitespace-nowrap">
          <Plus className="w-4 h-4" strokeWidth={2} />
          <span>NEW PROFILE</span>
        </button>
      </div>

      {/* ── AQL Categories Grid ───────────────────────────────────────────── */}
      <div className="bg-surface border border-gray-800 rounded-lg p-0 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-gray-800 bg-canvas/50 flex items-center justify-between">
          <h3 className="text-lg font-semibold uppercase text-primary tracking-wide flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-brand-secondary" strokeWidth={2} />
            AQL CATEGORIES & LIMITS
          </h3>
          <button className="h-10 px-3 rounded-lg bg-brand-primary/10 text-brand-secondary hover:bg-brand-primary/20 border border-brand-secondary/30 font-semibold text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all outline-none">
            <Plus className="w-4 h-4" strokeWidth={2} />
            ADD CATEGORY
          </button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr>
                <th className="bg-canvas text-xs font-semibold uppercase tracking-wider text-muted py-3 px-4 border-b border-gray-800">
                  CATEGORY NAME
                </th>
                <th className="bg-canvas text-xs font-semibold uppercase tracking-wider text-muted py-3 px-4 border-b border-gray-800">
                  AQL THRESHOLD LIMIT
                </th>
                <th className="bg-canvas text-xs font-semibold uppercase tracking-wider text-muted py-3 px-4 border-b border-gray-800">
                  EVALUATION MODE
                </th>
              </tr>
            </thead>
            <tbody>
              {activeProfile.categories.map((cat) => (
                <tr key={cat.id} className="hover:bg-canvas/30 transition-colors">
                  <td className="py-3.5 px-4 text-sm border-b border-gray-800/50 text-primary font-semibold">
                    {cat.name}
                  </td>
                  <td className="py-3.5 px-4 border-b border-gray-800/50">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-surface border border-gray-700 font-mono text-sm font-bold text-brand-secondary shadow-sm">
                      {cat.aqlLevel}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 border-b border-gray-800/50">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold tracking-wider uppercase border ${
                      cat.evaluationMode === 'CUMULATIVE' 
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    }`}>
                      <GitMerge className="w-3.5 h-3.5" strokeWidth={2} />
                      {cat.evaluationMode}
                    </span>
                  </td>
                </tr>
              ))}
              {activeProfile.categories.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-8 px-4 text-center text-muted text-sm italic">
                    No AQL categories configured for this profile.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Defect Definitions Grid ───────────────────────────────────────── */}
      <div className="bg-surface border border-gray-800 rounded-lg p-0 overflow-hidden shadow-sm mt-6">
        <div className="p-4 border-b border-gray-800 bg-canvas/50 flex items-center justify-between">
          <h3 className="text-lg font-semibold uppercase text-primary tracking-wide flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-brand-secondary" strokeWidth={2} />
            DEFECT DEFINITIONS
          </h3>
          <button className="h-10 px-3 rounded-lg bg-brand-primary/10 text-brand-secondary hover:bg-brand-primary/20 border border-brand-secondary/30 font-semibold text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all outline-none">
            <Plus className="w-4 h-4" strokeWidth={2} />
            ADD DEFECT
          </button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr>
                <th className="bg-canvas text-xs font-semibold uppercase tracking-wider text-muted py-3 px-4 border-b border-gray-800">
                  DEFECT NAME
                </th>
                <th className="bg-canvas text-xs font-semibold uppercase tracking-wider text-muted py-3 px-4 border-b border-gray-800">
                  DESCRIPTION
                </th>
                <th className="bg-canvas text-xs font-semibold uppercase tracking-wider text-muted py-3 px-4 border-b border-gray-800">
                  AQL CATEGORY
                </th>
              </tr>
            </thead>
            <tbody>
              {activeProfile.defects.map((defect) => {
                const category = activeProfile.categories.find(c => c.id === defect.categoryId);
                return (
                  <tr key={defect.id} className="hover:bg-canvas/30 transition-colors">
                    <td className="py-3.5 px-4 text-sm border-b border-gray-800/50 text-primary font-semibold">
                      {defect.name}
                    </td>
                    <td className="py-3.5 px-4 text-sm border-b border-gray-800/50 text-muted">
                      {defect.description}
                    </td>
                    <td className="py-3.5 px-4 border-b border-gray-800/50">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-brand-primary/10 text-brand-secondary border border-brand-secondary/30 text-xs font-semibold tracking-wider uppercase">
                        {category?.name || 'UNASSIGNED'}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {activeProfile.defects.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-8 px-4 text-center text-muted text-sm italic">
                    No defects defined for this profile.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
