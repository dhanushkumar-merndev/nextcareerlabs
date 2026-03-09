"use client";

import { AnimatePresence, motion } from "motion/react";
import React, { useEffect, useState } from "react";

interface DashboardGreetingProps {
  userName?: string | null | undefined;
}

const MOTIVATIONAL_PHRASES = [
  "Ready to crush your goals today?",
  "Knowledge is power. Let's get some!",
  "Small steps lead to big results. Keep going!",
  "Consistency is the key to mastery.",
  "Your future self will thank you for today's effort.",
  "Don't stop until you're proud.",
  "Every expert was once a beginner.",
  "The secret to getting ahead is getting started.",
  "Consistency beats talent when talent doesn't work hard.",
  "Mistakes are proof that you are trying.",
  "Learning never exhausts the mind.",
  "Focus on progress, not perfection.",
  "Your potential is endless.",
];

export function DashboardGreeting({ userName }: DashboardGreetingProps) {
  const [greeting, setGreeting] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    // Determine greeting based on time
    const hour = new Date().getHours();
    let timeGreeting = "Welcome back";
    if (hour < 12) timeGreeting = "Good morning";
    else if (hour < 17) timeGreeting = "Good afternoon";
    else timeGreeting = "Good evening";

    setGreeting(timeGreeting);

    // Initial random start
    setCurrentIndex(Math.floor(Math.random() * MOTIVATIONAL_PHRASES.length));

    // Change every 2 seconds
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % MOTIVATIONAL_PHRASES.length);
    }, 5000); // 2s show + 0.5s transition

    return () => clearInterval(interval);
  }, []);

  // Hydration safety: render a fallback until mounted
  if (!greeting) {
    return (
      <p className="text-muted-foreground">
        {userName ? `Welcome back, ${userName}...` : "Loading your progress..."}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center text-muted-foreground min-h-6 overflow-hidden">
      {userName ? (
        <span className="mr-1">
          {greeting},{" "}
          <span className="font-semibold text-foreground">{userName}</span>.
        </span>
      ) : null}

      <div className="relative h-6 flex items-center">
        <AnimatePresence mode="wait">
          <motion.span
            key={currentIndex}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="whitespace-nowrap inline-block"
          >
            {MOTIVATIONAL_PHRASES[currentIndex]}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );
}
