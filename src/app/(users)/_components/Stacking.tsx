/* This component is used to display the stacking cards */

"use client";
import { ChevronRight } from "lucide-react";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

// Stacking component
export default function Stacking() {
  const containerRef = useRef<HTMLUListElement>(null);
  const headingRef = useRef<HTMLDivElement>(null);

  const programs = [
    {
      title: "Salesforce Development",
      logo: "/logos/salesforce.webp",
      description: `  
                    Become a job-ready Salesforce professional.

                    • Salesforce Admin & configuration  
                    • Apex programming & LWC  
                    • Integrations & security  
                    • Real-world enterprise projects
                      `,
      image: "/programs/salesforce.webp",
    },
    {
      title: "DevOps Engineering",
      logo: "/logos/devops.webp",
      description: `
                      Learn modern DevOps tools and workflows.

                      • Linux & Git basics  
                      • Docker & Kubernetes  
                      • CI/CD pipelines  
                      • AWS cloud services
                            `,
      image: "/programs/devops.webp",
    },
    {
      title: "MERN Stack Development",
      logo: "/logos/mern.webp",
      description: `
                      Build scalable web and mobile applications.

                      • MongoDB, Express, React & Node.js  
                      • REST APIs & authentication  
                      • React Native for mobile apps  
                      • Career-focused projects
                            `,
      image: "/programs/mern.webp",
    },
  ];

 // Scroll Stacking
  useEffect(() => {
    const container = containerRef.current;
    const heading = headingRef.current;
    if (!container || !heading) return;
    const items = Array.from(
      container.querySelectorAll<HTMLLIElement>(".stack-item")
    );
    const gap = 40;
    const cardStickyTop = 240;
    const triggerIndex = 2;
    const earlyOffset = 55;
    const maxHeadingOffset = 180;
    let cardHeight = items[0]?.offsetHeight || 0;
    let ticking = false;
    const setup = () => {
      cardHeight = items[0]?.offsetHeight || 0;
      container.style.paddingBottom = `${gap * (items.length - 1)}px`;
      items.forEach((item, i) => {
        item.style.transform = `translateY(${gap * i}px)`;
      });
    };
    const animate = () => {
      const containerTop = container.getBoundingClientRect().top;
      const thirdCardTop = items[triggerIndex].getBoundingClientRect().top;
      const delta = cardStickyTop + earlyOffset - thirdCardTop;
      if (delta > 0) {
        const progress = Math.min(delta / 180, 1);
        heading.style.transform = `translateY(${
          -progress * maxHeadingOffset
        }px)`;
      } else {
        heading.style.transform = "translateY(0px)";
      }
      items.forEach((item, i) => {
        const scroll = cardStickyTop - containerTop - i * (cardHeight + gap);
        if (scroll > 0) {
          const scale =
            i === items.length - 1
              ? 1
              : (cardHeight - scroll * 0.045) / cardHeight;

          item.style.transform = `
            translateY(${gap * i}px)
            scale(${Math.max(scale, 0.86)})
          `;
        } else {
          item.style.transform = `translateY(${gap * i}px)`;
        }
      });
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(animate);
      }
    };

    setup();
    window.addEventListener("scroll", onScroll);
    window.addEventListener("resize", setup);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", setup);
    };
  }, []);
  
  return (
    <section className="pt-10 flex justify-center">
      <div className="w-full max-w-7xl px-4">
        {/* STICKY HEADING */}
        <div ref={headingRef} className="sticky top-28 z-30 bg-background/90 backdrop-blur pb-6 will-change-transform text-center">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight">
            Our Programs
          </h2>
        </div>
        {/* STACKING CARDS */}
        <ul ref={containerRef} className="relative mt-12">
          {programs.map((program, i) => {
            const isReverse = i % 2 !== 0;

            return (
              <li key={i} className="stack-item sticky top-50 md:top-60 aspect-square md:aspect-5/2 rounded-xl bg-background border shadow-xl transform-gpu origin-top">
                <div className={`h-full w-full flex flex-col md:flex-row ${isReverse ? "md:flex-row-reverse" : ""} items-center justify-center md:justify-start`}>
                  {/* TEXT */}
                  <div className="w-full md:w-[45%] p-6 md:p-10 space-y-4">
                    {/* TITLE + LOGO */}
                    <div className="flex items-center gap-3">
                      {/* Logo */}
                      <img
                        src={program.logo}
                        alt={`${program.title} logo`}
                        className="h-8 w-8 md:h-14 md:w-14 object-contain"
                        loading="lazy"
                      />
                      {/* Title */}
                      <h3 className="text-2xl md:text-3xl font-semibold tracking-tight">
                        {program.title}
                      </h3>
                    </div>

                    {/* Description */}
                    <p className="text-muted-foreground leading-relaxed text-base md:text-lg whitespace-pre-line">
                      {program.description}
                    </p>

                    {/* View Button */}
                    <div className="flex justify-end">
                      <Link
                        href="/courses"
                        className={buttonVariants({ className: "gap-2" , variant:"outline" })}
                      >
                        View
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>

                  {/* IMAGE — DESKTOP */}
                  <div className="hidden md:block w-full md:w-[55%] p-6 md:p-10">
                    {/* Image Container */}
                    <div className="relative aspect-video w-full rounded-lg overflow-hidden border">
                      <img
                        src={program.image}
                        alt={program.title}
                        className="absolute inset-0 h-full w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
