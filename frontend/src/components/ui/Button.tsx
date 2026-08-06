import { motion } from 'motion/react';

interface ButtonProps extends React.ComponentProps<typeof motion.button> {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: string;
}

export function Button({ variant = 'primary', className = '', children, ...props }: ButtonProps) {
  const baseStyles = "h-10 rounded-lg px-6 text-xs font-bold tracking-wider uppercase flex items-center justify-center transition-all hover:brightness-110 outline-none";
  
  const variants = {
    primary: "bg-accent-gradient text-white border-none shadow-md",
    secondary: "bg-surface text-primary border border-gray-700 hover:border-gray-500",
    danger: "bg-danger text-white border-none shadow-md"
  };

  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      className={`${baseStyles} ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </motion.button>
  );
}
