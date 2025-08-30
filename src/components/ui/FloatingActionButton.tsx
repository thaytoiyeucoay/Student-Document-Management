import React from 'react';
import { cn } from '../../lib/utils';

interface FloatingActionButtonProps {
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'secondary' | 'surface';
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  extended?: boolean;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}

export const FloatingActionButton: React.FC<FloatingActionButtonProps> = ({
  children,
  size = 'md',
  variant = 'primary',
  position = 'bottom-right',
  extended = false,
  onClick,
  className = '',
  disabled = false
}) => {
  const sizeClasses = {
    sm: extended ? "px-4 py-2 text-sm" : "w-10 h-10 text-sm",
    md: extended ? "px-6 py-3 text-base" : "w-14 h-14 text-base",
    lg: extended ? "px-8 py-4 text-lg" : "w-16 h-16 text-lg"
  };

  const variantClasses = {
    primary: "bg-primary-600 text-white hover:bg-primary-700 shadow-material-lg hover:shadow-material-xl",
    secondary: "bg-secondary-600 text-white hover:bg-secondary-700 shadow-material-lg hover:shadow-material-xl",
    surface: "bg-surface-100 text-surface-900 hover:bg-surface-200 dark:bg-surface-800 dark:text-surface-100 dark:hover:bg-surface-700 shadow-material-lg hover:shadow-material-xl"
  };

  const positionClasses = {
    'bottom-right': "fixed bottom-6 right-6",
    'bottom-left': "fixed bottom-6 left-6",
    'top-right': "fixed top-6 right-6",
    'top-left': "fixed top-6 left-6"
  };

  const baseClasses = "inline-flex items-center justify-center font-medium rounded-material-lg transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-primary-500/25 z-50 overflow-hidden group";

  const hoverClasses = "hover:scale-105 active:scale-95";
  const disabledClasses = disabled ? "opacity-50 cursor-not-allowed hover:scale-100 active:scale-100" : "";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        baseClasses,
        sizeClasses[size],
        variantClasses[variant],
        positionClasses[position],
        hoverClasses,
        disabledClasses,
        "animate-float",
        className
      )}
    >
      {/* Ripple effect */}
      <div className="absolute inset-0 bg-white/20 scale-0 rounded-material-lg transition-transform duration-300 group-active:scale-100" />
      
      {/* Shimmer effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-shimmer" />
      
      {/* Content */}
      <div className="relative flex items-center gap-2 animate-bounce-gentle">
        {children}
      </div>
    </button>
  );
};

export default FloatingActionButton;
