import { Check } from 'lucide-react';

export interface Step {
  id: number;
  name: string;
  description: string;
}

const steps: Step[] = [
  { id: 1, name: 'Batch & Line Info', description: 'SKU, Lot # & Mode' },
  { id: 2, name: 'AQL Plan', description: 'Sample Size Calculation' },
  { id: 3, name: 'Defect Counter', description: 'Water Tightness & Visual' },
  { id: 4, name: 'Review & Submit', description: 'Compliance & Pass/Fail' },
];

interface WizardStepperProps {
  currentStep: number;
  onStepClick?: (stepId: number) => void;
}

export function WizardStepper({ currentStep, onStepClick }: WizardStepperProps) {
  return (
    <div className="w-full bg-surface border border-gray-800 rounded-xl p-4 shadow-sm">
      <nav aria-label="Progress">
        <ol className="flex items-center justify-between w-full">
          {steps.map((step, stepIdx) => {
            const isCompleted = currentStep > step.id;
            const isCurrent = currentStep === step.id;

            return (
              <li key={step.name} className="relative flex-1 flex items-center">
                <div 
                  onClick={() => isCompleted && onStepClick?.(step.id)}
                  className={`group flex items-center w-full ${isCompleted ? 'cursor-pointer' : ''}`}
                >
                  {/* Step Circle */}
                  <div className="flex items-center shrink-0">
                    <span 
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-semibold text-sm transition-all duration-300 ${
                        isCompleted 
                          ? 'bg-brand-secondary text-canvas font-bold' 
                          : isCurrent 
                          ? 'bg-brand-primary text-white ring-4 ring-brand-primary/20 shadow-[0_0_15px_rgba(45,212,191,0.3)]' 
                          : 'bg-canvas text-gray-500 border border-gray-800'
                      }`}
                    >
                      {isCompleted ? <Check className="w-5 h-5 stroke-[3]" /> : step.id}
                    </span>
                  </div>

                  {/* Step Text Info */}
                  <div className="ml-3 hidden sm:flex flex-col truncate">
                    <span className={`text-xs font-bold uppercase tracking-wider ${
                      isCurrent ? 'text-brand-secondary' : isCompleted ? 'text-primary' : 'text-gray-500'
                    }`}>
                      {step.name}
                    </span>
                    <span className="text-[10px] text-muted truncate">
                      {step.description}
                    </span>
                  </div>
                </div>

                {/* Connecting Line between steps */}
                {stepIdx !== steps.length - 1 && (
                  <div className="mx-4 flex-1 hidden md:block">
                    <div className={`h-0.5 w-full rounded transition-colors duration-300 ${
                      currentStep > step.id ? 'bg-brand-secondary' : 'bg-gray-800'
                    }`} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}
