"use client";

import React, { useEffect, useState } from "react";

interface DashboardGreetingProps {
  userName: string | null | undefined;
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
];

export function DashboardGreeting({ userName }: DashboardGreetingProps) {
  const [greeting, setGreeting] = useState("");
  const [motivation, setMotivation] = useState("");

  useEffect(() => {
    // Determine greeting based on time
    const hour = new Date().getHours();
    let timeGreeting = "Welcome back";
    if (hour < 12) timeGreeting = "Good morning";
    else if (hour < 17) timeGreeting = "Good afternoon";
    else timeGreeting = "Good evening";

    setGreeting(timeGreeting);

    // Pick a random motivation
    const randomIdx = Math.floor(Math.random() * MOTIVATIONAL_PHRASES.length);
    setMotivation(MOTIVATIONAL_PHRASES[randomIdx]);
  }, []);

  // Hydration safety: render a fallback or null until mounted
  if (!greeting) {
    return (
      <p className="text-muted-foreground animate-pulse">
        Welcome back, {userName || "Student"}...
      </p>
    );
  }

  return (
    <p className="text-muted-foreground">
      {greeting},{" "}
      <span className="font-semibold text-foreground">
        {userName || "Student"}
      </span>
      . {motivation}
    </p>
  );
}
