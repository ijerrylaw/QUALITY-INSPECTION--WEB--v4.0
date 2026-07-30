/**
 * @file WizardPage.tsx
 * @description Parent Container Shell for the Smart Quality Inspection Wizard v4.0.
 *
 * Implements the Dual-Mode Data Entry Architecture:
 * 1. Guided 4-Step Wizard Mode (Lot-by-lot focus)
 * 2. Excel-Style Spreadsheet Grid Mode (Multi-lot batch focus)
 *
 * Level 1 Precedence: AI_RULES.md & UI_DESIGN_SYSTEM.md
 */

import { useState } from 'react';

import { Wand2, Table } from 'lucide-react';

import { StepMetadata } from './wizard/StepMetadata';
import { StepDimensions } from './wizard/StepDimensions';
import { StepDefects } from './wizard/StepDefects';
import { StepReviewSubmit } from './wizard/StepReviewSubmit';
import { SpreadsheetGrid } from './wizard/SpreadsheetGrid';

type EntryMode = 'GUIDED' | 'SPREADSHEET';

export function WizardPage() {
  // Mode Switcher State
  const [entryMode, setEntryMode] = useState<EntryMode>('GUIDED');

  // Guided Wizard State
  const [currentStep, setCurrentStep] = useState(1);
  const [inspectionData, setInspectionData] = useState<Record<string, any>>({});

  const handleNextStep = (data: any) => {
    setInspectionData(prev => ({ ...prev, ...data }));
    setCurrentStep(prev => prev + 1);
  };

  const handleBackStep = () => {
    setCurrentStep(prev => Math.max(1, prev - 1));
  };

  const handleResetWizard = () => {
    setInspectionData({});
    setCurrentStep(1);
  };

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto min-h-screen bg-canvas text-primary">
      {/* ── Page Header & Controls Bar ───────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-gray-800/80 pb-6">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-tight text-primary">
            QUALITY ENTRY WIZARD
          </h1>
          <p className="text-sm font-normal text-muted mt-1">
            Record batch inspection data using single entry wizard or batch entry grid.
          </p>
        </div>

        {/* Dual-Mode Header Switcher Component */}
        <div className="inline-flex bg-canvas p-1 rounded-lg border border-gray-800 h-12 items-center gap-1 shadow-inner">
          {/* Single Entry Toggle */}
          <button
            onClick={() => setEntryMode('GUIDED')}
            className={
              entryMode === 'GUIDED'
                ? 'bg-brand-primary text-white font-bold text-xs uppercase tracking-wider px-4 h-10 rounded-md shadow-md flex items-center gap-2'
                : 'text-muted hover:text-primary font-semibold text-xs uppercase tracking-wider px-4 h-10 rounded-md flex items-center gap-2 transition-colors cursor-pointer'
            }
          >
            <Wand2 className="w-4 h-4" strokeWidth={2} />
            Single Entry
          </button>
          
          {/* Batch Entry Toggle */}
          <button
            onClick={() => setEntryMode('SPREADSHEET')}
            className={
              entryMode === 'SPREADSHEET'
                ? 'bg-brand-primary text-white font-bold text-xs uppercase tracking-wider px-4 h-10 rounded-md shadow-md flex items-center gap-2'
                : 'text-muted hover:text-primary font-semibold text-xs uppercase tracking-wider px-4 h-10 rounded-md flex items-center gap-2 transition-colors cursor-pointer'
            }
          >
            <Table className="w-4 h-4" strokeWidth={2} />
            Batch Entry
          </button>
        </div>
      </div>

      {/* ── Main Content Area ───────────────────────────────────────────────── */}
      <div className="mt-8">
        {entryMode === 'GUIDED' ? (
          <div>
            {currentStep === 1 && <StepMetadata onNext={handleNextStep} initialData={inspectionData} />}
            {currentStep === 2 && <StepDimensions onNext={handleNextStep} onBack={handleBackStep} initialData={inspectionData} />}
            {currentStep === 3 && <StepDefects onNext={handleNextStep} onBack={handleBackStep} inspectionData={inspectionData} />}
            {currentStep === 4 && <StepReviewSubmit onBack={handleBackStep} inspectionData={inspectionData} onSubmit={handleResetWizard} />}
          </div>
        ) : (
          <div className="w-full">
            <SpreadsheetGrid />
          </div>
        )}
      </div>
    </div>
  );
}
