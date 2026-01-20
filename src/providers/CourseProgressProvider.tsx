"use client";
import{ createContext, useContext, useState, ReactNode } from "react";

interface CourseProgressContextType {
  progressPercentage: number;
  setProgressPercentage: (value: number) => void;
  showProgress: boolean;
  setShowProgress: (value: boolean) => void;
}

const CourseProgressContext = createContext<CourseProgressContextType | undefined>(undefined);

export function CourseProgressProvider({ children }: { children: ReactNode }) {
  const [progressPercentage, setProgressPercentage] = useState(0);
  const [showProgress, setShowProgress] = useState(false);

  return (
    <CourseProgressContext.Provider value={{ progressPercentage, setProgressPercentage, showProgress, setShowProgress }}>
      {children}
    </CourseProgressContext.Provider>
  );
}

export function useCourseProgressContext() {
  const context = useContext(CourseProgressContext);
  if (context === undefined) {
    throw new Error("useCourseProgressContext must be used within a CourseProgressProvider");
  }
  return context;
}
