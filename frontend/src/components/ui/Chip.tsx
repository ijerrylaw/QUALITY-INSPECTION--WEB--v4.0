import React from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';

type ChipType = 'metadata' | 'filter' | 'selection';

interface ChipProps {
  type?: ChipType;
  children: React.ReactNode;
  selected?: boolean; // Used for selection chips
  onRemove?: () => void; // Used for filter chips
  onClick?: () => void;
  className?: string;
}

export function Chip({ type = 'metadata', children, selected = false, onRemove, onClick, className = '' }: ChipProps) {
  
  if (type === 'selection') {
    const baseSelectionStyles = "h-12 px-4 rounded-lg flex items-center justify-center transition-all cursor-pointer font-semibold outline-none";
    const selectedStyles = selected 
      ? "bg-brand-primary text-white border border-brand-secondary shadow-sm" 
      : "bg-surface text-muted border border-gray-700 hover:border-gray-500";
    
    return (
      <motion.button 
        type="button"
        whileTap={{ scale: 0.95 }}
        onClick={onClick}
        className={`${baseSelectionStyles} ${selectedStyles} ${className}`}
      >
        {children}
      </motion.button>
    );
  }

  if (type === 'filter') {
    return (
      <motion.div 
        whileTap={onClick ? { scale: 0.95 } : undefined}
        className={`bg-brand-primary/10 text-brand-secondary border border-brand-secondary/30 text-xs font-semibold rounded-lg px-2.5 py-1 flex items-center gap-1.5 ${onClick ? 'cursor-pointer' : ''} ${className}`}
        onClick={onClick}
      >
        <span>{children}</span>
        {onRemove && (
          <X 
            className="w-3.5 h-3.5 hover:text-white cursor-pointer ml-0.5" 
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
          />
        )}
      </motion.div>
    );
  }

  // default: metadata
  return (
    <div className={`bg-surface text-primary border border-gray-700/80 text-xs font-medium rounded-lg px-2.5 py-1 inline-flex ${className}`}>
      {children}
    </div>
  );
}
