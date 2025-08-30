import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Material Design 3 elevation levels
export const elevations = {
  0: 'shadow-none',
  1: 'shadow-material',
  2: 'shadow-material-md',
  3: 'shadow-material-lg',
  4: 'shadow-material-xl',
} as const;

// Material Design 3 motion durations
export const motionDurations = {
  short1: '50ms',
  short2: '100ms',
  short3: '150ms',
  short4: '200ms',
  medium1: '250ms',
  medium2: '300ms',
  medium3: '350ms',
  medium4: '400ms',
  long1: '450ms',
  long2: '500ms',
  long3: '550ms',
  long4: '600ms',
} as const;

// Material Design 3 motion curves
export const motionCurves = {
  standard: 'cubic-bezier(0.2, 0.0, 0, 1.0)',
  decelerate: 'cubic-bezier(0.0, 0.0, 0, 1.0)',
  accelerate: 'cubic-bezier(0.3, 0.0, 1, 1.0)',
  emphasized: 'cubic-bezier(0.2, 0.0, 0, 1.0)',
} as const;
