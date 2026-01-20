"use client";

import { cn } from "@/lib/utils";

interface CircularProgressProps {
  value: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  showText?: boolean;
  showCircle?: boolean;
  progressClassName?: string;
  bgClassName?: string;
  textClassName?: string;
}

export function CircularProgress({
  value,
  size = 40,
  strokeWidth = 3,
  className,
  showText = true,
  showCircle = true,
  progressClassName = "text-primary",
  bgClassName = "text-muted-foreground/25",
  textClassName = "text-primary",
}: CircularProgressProps) {
  const center = 50;
  const radius = 38; // Give more space for text and avoid clipping
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;

  // Calculate stroke width relative to the coordinate system (100x100)
  const relativeStrokeWidth = (strokeWidth / size) * 100;

  return (
    <div 
      className={cn("relative inline-flex items-center justify-center shrink-0", className)}
      style={{ width: size, height: size }}
    >
      {showCircle && (
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full transform -rotate-90"
        >
          {/* Background circle */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            stroke="currentColor"
            strokeWidth={relativeStrokeWidth}
            fill="transparent"
            className={cn(bgClassName)}
          />
          {/* Progress circle */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            stroke="currentColor"
            strokeWidth={relativeStrokeWidth}
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className={cn("transition-all duration-300", progressClassName)}
          />
        </svg>
      )}
      {showText && (
        <span className={cn("absolute text-[9px] font-bold tabular-nums leading-none tracking-tighter", textClassName)}>
          {Math.round(value)}%
        </span>
      )}
    </div>
  );
}
