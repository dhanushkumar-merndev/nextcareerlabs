"use client";
import{ createContext, useContext, useState, ReactNode } from "react";

interface CourseProgressContextType {
  progressPercentage: number;
  setProgressPercentage: (value: number) => void;
  showProgress: boolean;
  setShowProgress: (value: boolean) => void;
  courseTitle: string;
  setCourseTitle: (value: string) => void;
}

const CourseProgressContext = createContext<CourseProgressContextType | undefined>(undefined);

export function CourseProgressProvider({ children }: { children: ReactNode }) {
  const [progressPercentage, setProgressPercentage] = useState(0);
  const [showProgress, setShowProgress] = useState(false);
  const [courseTitle, setCourseTitle] = useState("");

  return (
    <CourseProgressContext.Provider value={{ 
      progressPercentage, 
      setProgressPercentage, 
      showProgress, 
      setShowProgress,
      courseTitle,
      setCourseTitle
    }}>
      {children}
    </CourseProgressContext.Provider>
  );
}

export function useCourseProgressContext() {
  const context = useContext(CourseProgressContext);
  if (context === undefined) {
    return {
      progressPercentage: 0,
      setProgressPercentage: () => {},
      showProgress: false,
      setShowProgress: () => {},
      courseTitle: "",
      setCourseTitle: () => {}
    };
  }
  return context;
}
