import React from 'react';
import { cn } from '../../lib/utils.ts';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'light' | 'dark' | 'primary' | 'secondary';
  blur?: 'sm' | 'md' | 'lg' | 'xl';
  hover?: boolean;
  onClick?: () => void;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  className = '',
  variant = 'light',
  blur = 'md',
  hover = false,
  onClick
}) => {
  const baseClasses = "relative overflow-hidden border border-white/20 rounded-material";
  
  const variantClasses = {
    light: "bg-white/80 backdrop-blur-sm shadow-md border-slate-200/50",
    dark: "bg-slate-800/80 backdrop-blur-sm shadow-md border-slate-600/50",
    primary: "bg-blue-50/90 backdrop-blur-sm shadow-md border-blue-200/50",
    secondary: "bg-purple-50/90 backdrop-blur-sm shadow-md border-purple-200/50"
  };

  const blurClasses = {
    sm: "backdrop-blur-sm",
    md: "backdrop-blur-md", 
    lg: "backdrop-blur-lg",
    xl: "backdrop-blur-xl"
  };

  const hoverClasses = hover 
    ? "transition-all duration-300 hover:scale-[1.02] hover:shadow-material-lg hover:bg-white/15 dark:hover:bg-white/5" 
    : "";

  const clickableClasses = onClick ? "cursor-pointer" : "";

  return (
    <div 
      className={cn(
        baseClasses,
        variantClasses[variant],
        blurClasses[blur],
        hoverClasses,
        clickableClasses,
        "animate-fade-in",
        className
      )}
      onClick={onClick}
    >
      {/* Glassmorphism shimmer effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-shimmer" />
      
      {children}
    </div>
  );
};

export default GlassCard;
