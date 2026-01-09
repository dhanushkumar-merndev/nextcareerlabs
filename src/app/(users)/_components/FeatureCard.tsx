"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnimatedIconHandle } from "@/lib/icon-animation";
import type { HTMLAttributes } from "react";

interface FeatureCardProps {
  title: string;
  description: string;
  Icon: React.ForwardRefExoticComponent<
    React.PropsWithoutRef<HTMLAttributes<HTMLDivElement>> &
      React.RefAttributes<AnimatedIconHandle>
  >;
}

export function FeatureCard({ title, description, Icon }: FeatureCardProps) {
  const iconRef = useRef<AnimatedIconHandle | null>(null);

  /* ================= DETECT MOBILE (STATE + EFFECT) ================= */
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.matchMedia("(max-width: 767px)").matches);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  /* ================= MOBILE: INFINITE ANIMATION ================= */
  useEffect(() => {
    if (!isMobile) return;

    // Small delay to ensure mount and ref ready
    const timer = setTimeout(() => {
        const icon = iconRef.current;
        if (!icon) return;

        let cancelled = false;

        const loop = async () => {
            while (!cancelled) {
                if (icon) await icon.startAnimation();
                if (cancelled) break;
                await new Promise((r) => setTimeout(r, 1200));
            }
        };

        loop();

        return () => {
          cancelled = true;
          icon?.stopAnimation();
        };
    }, 100);

    return () => clearTimeout(timer);
  }, [isMobile]);

  return (
    <Card
      /* Hover ONLY on desktop */
      onMouseEnter={
        !isMobile ? () => iconRef.current?.startAnimation() : undefined
      }
      onMouseLeave={
        !isMobile ? () => iconRef.current?.stopAnimation() : undefined
      }
      className={`
        group rounded-xl border bg-card
        transition-shadow duration-200 hover:shadow-lg
        p-4 md:py-9 md:px-9
      `}
    >
      {/* HEADER */}
      <CardHeader
        className={`
          flex flex-row items-center gap-4
          md:flex-col md:items-start md:gap-3
          p-0
        `}
      >
        {/* ICON */}
        <div
          className={`
            size-12 md:size-14
            flex items-center justify-center
            rounded-xl bg-primary/10
            group-hover:bg-primary/20
            transition-colors duration-200
          `}
        >
          <Icon ref={iconRef} className="text-primary" />
        </div>

        {/* TITLE */}
        <CardTitle className="text-base md:text-lg font-semibold">
          {title}
        </CardTitle>
      </CardHeader>

      {/* DESCRIPTION (DESKTOP ONLY) */}
      <CardContent className="hidden md:block px-0 pt-3">
        <p className="text-muted-foreground text-sm leading-relaxed">
          {description}
        </p>
      </CardContent>
    </Card>
  );
}
