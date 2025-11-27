"use client";

import React from "react";

interface LoaderProps {
  size?: "sm" | "md" | "lg" | "xl";
  text?: string;
  fullScreen?: boolean;
}

const Loader: React.FC<LoaderProps> = ({
  size = "md",
  text,
  fullScreen = false,
}) => {
  const sizeMap = {
    sm: 32,
    md: 48,
    lg: 64,
    xl: 80,
  };

  const dimension = sizeMap[size];
  const color = "#3b82f6"; // blue-500

  const containerClass = fullScreen
    ? "fixed inset-0 flex flex-col items-center justify-center bg-background/70 backdrop-blur-sm z-[999]"
    : "fixed inset-0 flex flex-col items-center justify-center";

  return (
    <div className={containerClass}>
      <div className="relative" style={{ width: dimension, height: dimension }}>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          
          @keyframes pulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(0.8); opacity: 0.5; }
          }
          
          @keyframes orbit {
            0% { transform: rotate(0deg) translateX(${
              dimension * 0.35
            }px) rotate(0deg); }
            100% { transform: rotate(360deg) translateX(${
              dimension * 0.35
            }px) rotate(-360deg); }
          }
          
          .loader-ring {
            animation: spin 1.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) infinite;
          }
          
          .loader-center {
            animation: pulse 1.5s ease-in-out infinite;
          }
          
          .loader-dot {
            animation: orbit 2s linear infinite;
          }
        `}</style>

        {/* Outer ring */}
        <div
          className="loader-ring absolute inset-0 rounded-full border-4 border-t-transparent"
          style={{
            borderColor: `transparent ${color} ${color} ${color}`,
            opacity: 0.6,
          }}
        />

        {/* Middle ring */}
        <div
          className="loader-ring absolute rounded-full border-4 border-t-transparent"
          style={{
            borderColor: `${color} transparent transparent transparent`,
            opacity: 0.4,
            top: "15%",
            left: "15%",
            right: "15%",
            bottom: "15%",
            animationDirection: "reverse",
            animationDuration: "1.2s",
          }}
        />

        {/* Center pulse */}
        <div
          className="loader-center absolute rounded-full"
          style={{
            backgroundColor: color,
            top: "35%",
            left: "35%",
            right: "35%",
            bottom: "35%",
          }}
        />

        {/* Orbiting dot */}
        <div
          className="loader-dot absolute rounded-full"
          style={{
            backgroundColor: color,
            width: dimension * 0.15,
            height: dimension * 0.15,
            top: "50%",
            left: "50%",
            marginTop: -dimension * 0.075,
            marginLeft: -dimension * 0.075,
          }}
        />
      </div>

      {text && (
        <p
          className="mt-4 text-center font-medium animate-pulse"
          style={{ color }}
        >
          {text}
        </p>
      )}
    </div>
  );
};

export default Loader;
