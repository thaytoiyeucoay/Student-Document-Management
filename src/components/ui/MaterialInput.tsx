import React, { useState, useRef, forwardRef } from 'react';
import { cn } from '../../lib/utils';

interface MaterialInputProps {
  label?: string;
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  type?: 'text' | 'email' | 'password' | 'search' | 'tel' | 'url';
  variant?: 'outlined' | 'filled';
  size?: 'sm' | 'md' | 'lg';
  error?: string;
  disabled?: boolean;
  required?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  className?: string;
  onFocus?: () => void;
  onBlur?: () => void;
}

export const MaterialInput = forwardRef<HTMLInputElement, MaterialInputProps>(({
  label,
  placeholder,
  value = '',
  onChange,
  type = 'text',
  variant = 'outlined',
  size = 'md',
  error,
  disabled = false,
  required = false,
  icon,
  iconPosition = 'left',
  className = '',
  onFocus,
  onBlur
}, ref) => {
  const [focused, setFocused] = useState(false);
  const [hasValue, setHasValue] = useState(!!value);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFocus = () => {
    setFocused(true);
    onFocus?.();
  };

  const handleBlur = () => {
    setFocused(false);
    onBlur?.();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setHasValue(!!newValue);
    onChange?.(newValue);
  };

  const sizeClasses = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-lg"
  };

  const inputSizeClasses = {
    sm: "px-3 py-2 text-sm",
    md: "px-4 py-3 text-base",
    lg: "px-5 py-4 text-lg"
  };

  const labelSizeClasses = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base"
  };

  const baseInputClasses = "w-full bg-transparent border-0 outline-none transition-all duration-200 placeholder-transparent peer";
  
  const containerClasses = variant === 'outlined' 
    ? cn(
        "relative border-2 rounded-material transition-all duration-200",
        focused ? "border-primary-600 shadow-material" : "border-surface-300 dark:border-surface-600",
        error ? "border-red-500" : "",
        disabled ? "opacity-50 cursor-not-allowed" : "hover:border-surface-400 dark:hover:border-surface-500"
      )
    : cn(
        "relative bg-surface-100 dark:bg-surface-800 rounded-t-material border-b-2 transition-all duration-200",
        focused ? "border-primary-600 bg-surface-200 dark:bg-surface-700" : "border-surface-300 dark:border-surface-600",
        error ? "border-red-500" : "",
        disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-surface-200 dark:hover:bg-surface-700"
      );

  const labelClasses = cn(
    "absolute left-4 transition-all duration-200 pointer-events-none",
    labelSizeClasses[size],
    variant === 'outlined' 
      ? cn(
          "bg-white dark:bg-slate-900 px-1",
          focused || hasValue 
            ? "-top-2 text-primary-600 scale-75" 
            : "top-1/2 -translate-y-1/2 text-surface-500"
        )
      : cn(
          focused || hasValue 
            ? "top-1 text-primary-600 scale-75" 
            : "top-1/2 -translate-y-1/2 text-surface-500"
        ),
    error ? "text-red-500" : ""
  );

  return (
    <div className={cn("relative animate-slide-up", className)}>
      <div className={containerClasses}>
        {/* Icon */}
        {icon && iconPosition === 'left' && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500 animate-pulse-gentle">
            {icon}
          </div>
        )}

        {/* Input */}
        <input
          ref={ref || inputRef}
          type={type}
          value={value}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          disabled={disabled}
          required={required}
          placeholder={placeholder}
          className={cn(
            baseInputClasses,
            inputSizeClasses[size],
            sizeClasses[size],
            icon && iconPosition === 'left' ? "pl-10" : "",
            icon && iconPosition === 'right' ? "pr-10" : ""
          )}
        />

        {/* Label */}
        {label && (
          <label className={labelClasses}>
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}

        {/* Icon */}
        {icon && iconPosition === 'right' && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 animate-pulse-gentle">
            {icon}
          </div>
        )}

        {/* Focus ring */}
        <div className={cn(
          "absolute inset-0 rounded-material pointer-events-none transition-all duration-200",
          focused ? "ring-2 ring-primary-600/20" : ""
        )} />
      </div>

      {/* Error message */}
      {error && (
        <div className="mt-1 text-xs text-red-500 animate-fade-in">
          {error}
        </div>
      )}
    </div>
  );
});

MaterialInput.displayName = 'MaterialInput';

export default MaterialInput;
