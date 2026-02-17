"use client";

import { useState } from "react";
import { FeatureCard } from "./FeatureCard";
import type { FeatureCardProps } from "@/lib/types/homePage";

interface FeaturesSectionProps {
  features: Omit<FeatureCardProps, "isExpanded" | "onToggle">[];
}

export default function FeaturesSection({ features }: FeaturesSectionProps) {
  const [activeTitle, setActiveTitle] = useState<string | null>(null);

  return (
    <section className="grid grid-cols-1 gap-6 px-4 pb-8 md:grid-cols-2 lg:grid-cols-4 lg:px-6 xl:pb-16">
      {features.map((feature) => (
        <FeatureCard 
          key={feature.title} 
          {...feature} 
          isExpanded={activeTitle === feature.title}
          onToggle={() => {
            setActiveTitle(prev => prev === feature.title ? null : feature.title);
          }}
        />
      ))}
    </section>
  );
}
