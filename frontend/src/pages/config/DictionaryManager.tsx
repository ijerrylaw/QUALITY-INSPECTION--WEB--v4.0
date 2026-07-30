import { useState, useRef, useEffect } from 'react';
import { Plus, Trash, Edit2, ArrowUp, ArrowDown, Check, X } from 'lucide-react';
import type { SKUOption } from '../../context/ConfigContext';

interface DictionaryManagerProps {
  title: string;
  description: string;
  options: SKUOption[];
  onAdd: (value: string, label: string) => void;
  onRemove: (value: string) => void;
  onEdit?: (oldValue: string, newValue: string, newLabel: string) => void;
  onMove?: (value: string, direction: 'up' | 'down') => void;
  valuePlaceholder: string;
  labelPlaceholder: string;
  maxLength: number;
}

export function DictionaryManager({
  title,
  description,
  options,
  onAdd,
  onRemove,
  onEdit,
  onMove,
  valuePlaceholder,
  labelPlaceholder,
  maxLength,
}: DictionaryManagerProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newVal, setNewVal] = useState('');
  const [newLbl, setNewLbl] = useState('');
  
  const [editingVal, setEditingVal] = useState<string | null>(null);
  const [editInputVal, setEditInputVal] = useState('');
  const [editInputLbl, setEditInputLbl] = useState('');

  const valInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isAdding && valInputRef.current) {
      valInputRef.current.focus();
    }
  }, [isAdding]);

  const handleSaveNew = () => {
    if (newVal.trim() && newLbl.trim()) {
      onAdd(newVal.trim().toUpperCase(), newLbl.trim());
      setIsAdding(false);
      setNewVal('');
      setNewLbl('');
    }
  };

  const startEdit = (opt: SKUOption) => {
    setIsAdding(false);
    setEditingVal(opt.value);
    setEditInputVal(opt.value);
    setEditInputLbl(opt.label);
  };

  const saveEdit = () => {
    if (onEdit && editingVal && editInputVal.trim() && editInputLbl.trim()) {
      onEdit(editingVal, editInputVal.trim().toUpperCase(), editInputLbl.trim());
      setEditingVal(null);
    }
  };

  return (
    <div className="bg-canvas border border-gray-800 rounded-xl overflow-hidden shadow-sm flex flex-col h-[320px]">
      <div className="p-3 border-b border-gray-800 bg-surface">
        <h4 className="text-xs font-bold uppercase tracking-wider text-primary">{title}</h4>
        <p className="text-[10px] text-muted mt-1 leading-tight">{description}</p>
      </div>
      
      <div className="p-3 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-2">
          {options.map((opt, idx) => (
            <div key={opt.value} className="min-h-8 py-1 pl-2 pr-1 rounded bg-surface border border-gray-700 flex flex-col justify-center group relative">
              {editingVal === opt.value ? (
                <div className="flex items-start gap-1 py-1">
                  <div className="flex flex-col gap-1 w-full min-w-0">
                    <input 
                      type="text" 
                      autoFocus
                      value={editInputVal} 
                      onChange={(e) => setEditInputVal(e.target.value.toUpperCase().slice(0, maxLength))}
                      className="w-full h-7 px-1.5 rounded bg-canvas border border-brand-secondary text-primary font-mono text-xs outline-none uppercase"
                    />
                    <input 
                      type="text" 
                      value={editInputLbl} 
                      onChange={(e) => setEditInputLbl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit();
                        if (e.key === 'Escape') setEditingVal(null);
                      }}
                      className="w-full h-7 px-1.5 rounded bg-canvas border border-gray-700 focus:border-brand-secondary text-primary text-xs outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button onClick={saveEdit} className="w-6 h-6 rounded flex items-center justify-center text-emerald-400 hover:bg-emerald-500/20 outline-none" title="Save">
                      <Check className="w-3 h-3" />
                    </button>
                    <button onClick={() => setEditingVal(null)} className="w-6 h-6 rounded flex items-center justify-center text-rose-400 hover:bg-rose-500/20 outline-none" title="Cancel (Esc)">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center w-full">
                  <div className="flex flex-col gap-0.5 overflow-hidden w-full py-0.5">
                    <span className="font-mono text-xs font-bold text-brand-secondary shrink-0">{opt.value}</span>
                    <span className="text-xs text-primary truncate leading-tight pr-6">{opt.label}</span>
                  </div>
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-surface pl-4 bg-gradient-to-r from-transparent via-surface to-surface">
                    {onMove && (
                      <>
                        <button onClick={() => onMove(opt.value, 'up')} disabled={idx === 0} className="w-5 h-5 rounded flex items-center justify-center text-muted hover:text-primary disabled:opacity-30 outline-none">
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button onClick={() => onMove(opt.value, 'down')} disabled={idx === options.length - 1} className="w-5 h-5 rounded flex items-center justify-center text-muted hover:text-primary disabled:opacity-30 outline-none">
                          <ArrowDown className="w-3 h-3" />
                        </button>
                      </>
                    )}
                    {onEdit && (
                      <button onClick={() => startEdit(opt)} className="w-5 h-5 rounded flex items-center justify-center text-muted hover:text-white hover:bg-gray-800 outline-none">
                        <Edit2 className="w-3 h-3" />
                      </button>
                    )}
                    <button onClick={() => onRemove(opt.value)} className="w-5 h-5 rounded flex items-center justify-center text-muted hover:text-rose-400 hover:bg-rose-500/10 shrink-0 outline-none">
                      <Trash className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          
          {isAdding && (
            <div className="min-h-8 py-1.5 pl-2 pr-1 rounded bg-surface border border-gray-700 flex items-start gap-1">
              <div className="flex flex-col gap-1 w-full min-w-0">
                <input
                  ref={valInputRef}
                  type="text"
                  value={newVal}
                  onChange={(e) => setNewVal(e.target.value.toUpperCase().slice(0, maxLength))}
                  placeholder={valuePlaceholder}
                  className="w-full h-7 px-1.5 rounded bg-canvas border border-brand-secondary text-primary font-mono text-xs outline-none uppercase"
                />
                <input
                  type="text"
                  value={newLbl}
                  onChange={(e) => setNewLbl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveNew();
                    if (e.key === 'Escape') setIsAdding(false);
                  }}
                  placeholder={labelPlaceholder}
                  className="w-full h-7 px-1.5 rounded bg-canvas border border-gray-700 focus:border-brand-secondary text-primary text-xs outline-none"
                />
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button onClick={handleSaveNew} className="w-6 h-6 rounded flex items-center justify-center text-emerald-400 hover:bg-emerald-500/20 outline-none" title="Save">
                  <Check className="w-3 h-3" />
                </button>
                <button onClick={() => setIsAdding(false)} className="w-6 h-6 rounded flex items-center justify-center text-rose-400 hover:bg-rose-500/20 outline-none" title="Cancel (Esc)">
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
          
          {options.length === 0 && !isAdding && (
            <div className="text-xs text-muted italic text-center py-4">No entries</div>
          )}
        </div>
        
        {!isAdding && (
          <button
            onClick={() => { setIsAdding(true); setEditingVal(null); }}
            className="w-full mt-3 h-8 rounded border border-dashed border-gray-700 bg-surface-light/30 text-muted hover:text-brand-secondary hover:border-brand-secondary hover:bg-brand-primary/10 font-semibold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1 transition-all outline-none"
          >
            <Plus className="w-3 h-3" /> ADD
          </button>
        )}
      </div>
    </div>
  );
}
