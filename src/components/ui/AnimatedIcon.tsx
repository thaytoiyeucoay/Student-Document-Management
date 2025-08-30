import React from 'react';
import { cn } from '../../lib/utils';

interface AnimatedIconProps {
  children: React.ReactNode;
  animation?: 'bounce' | 'pulse' | 'spin' | 'float' | 'scale' | 'shimmer';
  trigger?: 'hover' | 'always' | 'focus' | 'active';
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const AnimatedIcon: React.FC<AnimatedIconProps> = ({
  children,
  animation = 'bounce',
  trigger = 'hover',
  className = '',
  size = 'md'
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
    xl: 'w-8 h-8'
  };

  const animationClasses = {
    bounce: 'animate-bounce-gentle',
    pulse: 'animate-pulse-gentle',
    spin: 'animate-spin',
    float: 'animate-float',
    scale: 'hover:scale-110 active:scale-95',
    shimmer: 'animate-shimmer'
  };

  const triggerClasses = {
    hover: `hover:${animationClasses[animation]}`,
    always: animationClasses[animation],
    focus: `focus:${animationClasses[animation]}`,
    active: `active:${animationClasses[animation]}`
  };

  return (
    <div 
      className={cn(
        "inline-flex items-center justify-center transition-all duration-200",
        sizeClasses[size],
        trigger === 'always' ? animationClasses[animation] : triggerClasses[trigger],
        className
      )}
    >
      {children}
    </div>
  );
};

export default AnimatedIcon;
