import React from 'react';

type BadgeVariant = 'success' | 'danger' | 'warning';

interface BadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant, children, className = '' }: BadgeProps) {
  const baseStyles = "inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border bg-opacity-10 border-opacity-30";

  const variants: Record<BadgeVariant, string> = {
    success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    danger: "bg-rose-500/10 text-rose-400 border-rose-500/30",
    warning: "bg-amber-500/10 text-amber-400 border-amber-500/30"
  };

  return (
    <span className={`${baseStyles} ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
}
