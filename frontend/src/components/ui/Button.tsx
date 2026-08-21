import { motion } from 'motion/react';

interface ButtonProps extends React.ComponentProps<typeof motion.button> {
  variant?: 'primary' | 'secondary' | 'danger';
  /**
   * 'icon' swaps the default h-10/px-6 for a fixed h-8 w-8/p-0 square —
   * as a fully separate, mutually-exclusive class set, not a className
   * override layered on top of the default. Tailwind utility classes of
   * equal specificity are resolved by their order in the COMPILED
   * stylesheet, not by source order in a className string — a caller
   * passing className="w-8 h-8 p-0" to try to shrink this button does
   * NOT reliably win against the base px-6, and previously didn't
   * (confirmed against the actual compiled CSS: .px-6 was emitted after
   * .p-0, so px-6 always won, squeezing icon-only buttons' content
   * outside their visible box). Any other value (including the 'lg'
   * already passed at a few call sites, pre-existing and always inert —
   * unrelated to this) keeps today's default sizing unchanged.
   */
  size?: 'default' | 'icon' | string;
}

export function Button({ variant = 'primary', size = 'default', className = '', children, ...props }: ButtonProps) {
  const baseStyles = "rounded-lg text-xs font-bold tracking-wider uppercase flex items-center justify-center transition-all hover:brightness-110 outline-none";
  const sizeStyles = size === 'icon' ? "h-8 w-8 p-0" : "h-10 px-6";

  const variants = {
    primary: "bg-accent-gradient text-white border-none shadow-md",
    secondary: "bg-surface text-primary border border-gray-700 hover:border-gray-500",
    danger: "bg-danger text-white border-none shadow-md"
  };

  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      className={`${baseStyles} ${sizeStyles} ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </motion.button>
  );
}
