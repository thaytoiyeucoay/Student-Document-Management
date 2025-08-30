import React from 'react';
import { cn } from '../../lib/utils';

interface MaterialButtonProps {
  children?: React.ReactNode;
  variant?: 'filled' | 'outlined' | 'text' | 'elevated' | 'tonal';
  size?: 'sm' | 'md' | 'lg';
  color?: 'primary' | 'secondary' | 'surface';
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  className?: string;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
}

export const MaterialButton: React.FC<MaterialButtonProps> = ({
  children,
  variant = 'filled',
  size = 'md',
  color = 'primary',
  disabled = false,
  loading = false,
  icon,
  iconPosition = 'left',
  className = '',
  onClick,
  type = 'button'
}) => {
  const baseClasses = "relative inline-flex items-center justify-center font-medium rounded-material transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 overflow-hidden";

  const sizeClasses = {
    sm: "px-3 py-1.5 text-sm gap-1.5",
    md: "px-4 py-2 text-sm gap-2",
    lg: "px-6 py-3 text-base gap-2.5"
  };

  const variantClasses = {
    filled: {
      primary: "bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500 shadow-material hover:shadow-material-md",
      secondary: "bg-secondary-600 text-white hover:bg-secondary-700 focus:ring-secondary-500 shadow-material hover:shadow-material-md",
      surface: "bg-surface-600 text-white hover:bg-surface-700 focus:ring-surface-500 shadow-material hover:shadow-material-md"
    },
    outlined: {
      primary: "border-2 border-primary-600 text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950 focus:ring-primary-500",
      secondary: "border-2 border-secondary-600 text-secondary-600 hover:bg-secondary-50 dark:hover:bg-secondary-950 focus:ring-secondary-500",
      surface: "border-2 border-surface-600 text-surface-600 hover:bg-surface-50 dark:hover:bg-surface-950 focus:ring-surface-500"
    },
    text: {
      primary: "text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950 focus:ring-primary-500",
      secondary: "text-secondary-600 hover:bg-secondary-50 dark:hover:bg-secondary-950 focus:ring-secondary-500",
      surface: "text-surface-600 hover:bg-surface-50 dark:hover:bg-surface-950 focus:ring-surface-500"
    },
    elevated: {
      primary: "bg-primary-100 text-primary-900 hover:bg-primary-200 dark:bg-primary-900 dark:text-primary-100 dark:hover:bg-primary-800 shadow-material-md hover:shadow-material-lg focus:ring-primary-500",
      secondary: "bg-secondary-100 text-secondary-900 hover:bg-secondary-200 dark:bg-secondary-900 dark:text-secondary-100 dark:hover:bg-secondary-800 shadow-material-md hover:shadow-material-lg focus:ring-secondary-500",
      surface: "bg-surface-100 text-surface-900 hover:bg-surface-200 dark:bg-surface-800 dark:text-surface-100 dark:hover:bg-surface-700 shadow-material-md hover:shadow-material-lg focus:ring-surface-500"
    },
    tonal: {
      primary: "bg-primary-100 text-primary-800 hover:bg-primary-200 dark:bg-primary-800 dark:text-primary-200 dark:hover:bg-primary-700 focus:ring-primary-500",
      secondary: "bg-secondary-100 text-secondary-800 hover:bg-secondary-200 dark:bg-secondary-800 dark:text-secondary-200 dark:hover:bg-secondary-700 focus:ring-secondary-500",
      surface: "bg-surface-100 text-surface-800 hover:bg-surface-200 dark:bg-surface-800 dark:text-surface-200 dark:hover:bg-surface-700 focus:ring-surface-500"
    }
  };

  const disabledClasses = "opacity-50 cursor-not-allowed hover:transform-none";
  const loadingClasses = "cursor-wait";

  const rippleEffect = !disabled && !loading ? "before:absolute before:inset-0 before:bg-white/20 before:scale-0 before:rounded-full before:transition-transform before:duration-300 active:before:scale-100" : "";

  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={cn(
        baseClasses,
        sizeClasses[size],
        variantClasses[variant][color],
        disabled && disabledClasses,
        loading && loadingClasses,
        rippleEffect,
        "animate-scale-in",
        className
      )}
    >
      {/* Loading spinner */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Content */}
      <div className={cn("flex items-center gap-inherit", loading && "invisible")}>
        {icon && iconPosition === 'left' && (
          <span className="flex-shrink-0 animate-bounce-gentle">{icon}</span>
        )}
        <span>{children}</span>
        {icon && iconPosition === 'right' && (
          <span className="flex-shrink-0 animate-bounce-gentle">{icon}</span>
        )}
      </div>

      {/* Ripple effect overlay */}
      <div className="absolute inset-0 overflow-hidden rounded-material">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-shimmer" />
      </div>
    </button>
  );
};

export default MaterialButton;
