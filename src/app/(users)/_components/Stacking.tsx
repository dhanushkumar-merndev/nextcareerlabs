/* This component is used to display the stacking cards */

"use client";
import { ChevronRight } from "lucide-react";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import Image from "next/image";

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
        <div ref={headingRef} className="sticky top-28 z-30 bg-background pb-6 will-change-transform text-center">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight">
            Our Programs
          </h2>
        </div>
        {/* STACKING CARDS */}
        <ul ref={containerRef} className="relative mt-12">
          {programs.map((program, i) => {
            const isReverse = i % 2 !== 0;

            return (
              <li key={i} className="stack-item sticky top-50 md:top-60 aspect-4/5 md:aspect-5/2 rounded-3xl bg-background border shadow-2xl transform-gpu origin-top overflow-hidden">
                <div className={`h-full w-full flex flex-col md:flex-row ${isReverse ? "md:flex-row-reverse" : ""} transition-all duration-500`}>
                  
                  {/* IMAGE SECTION - Top 50% on Mobile, 55% Width on Desktop */}
                  <div className="w-full h-1/2 md:h-full md:w-[55%] p-4 md:p-8">
                    <div className="relative h-full w-full rounded-2xl overflow-hidden border bg-muted/20">
                      <Image
                        src={program.image}
                        alt={program.title}
                        fill
                        className="object-cover transition-transform duration-700 group-hover:scale-105"
                        loading="lazy"
                      />
                    </div>
                  </div>

                  {/* TEXT SECTION - Bottom 50% on Mobile, 45% Width on Desktop */}
                  <div className="w-full h-1/2 md:h-full md:w-[45%] p-6 md:p-10 flex flex-col">
                    {/* TITLE + LOGO */}
                    <div className="flex items-center gap-4 mb-4">
                      <div className="p-2 rounded-xl bg-background border shadow-sm">
                        <Image
                          src={program.logo}
                          alt={`${program.title} logo`}
                          width={48}
                          height={48}
                          className="h-8 w-8 md:h-12 md:w-12 object-contain"
                          loading="lazy"
                        />
                      </div>
                      <h3 className="text-xl md:text-3xl font-bold tracking-tight">
                        {program.title}
                      </h3>
                    </div>

                    {/* Description Container with Gradient Fade for Overflow */}
                    <div className="relative flex-1 overflow-hidden min-h-0">
                      <p className="text-muted-foreground leading-relaxed text-sm md:text-lg whitespace-pre-line">
                        {program.description}
                      </p>
                      {/* Gradient Fade to indicate overflow on mobile */}
                      <div className="absolute bottom-0 left-0 w-full h-16 bg-linear-to-t from-background via-background/80 to-transparent pointer-events-none md:hidden" />
                      <div className="absolute bottom-0 left-0 w-full h-12 bg-linear-to-t from-background/40 to-transparent hidden md:block pointer-events-none" />
                    </div>

                    {/* View Button - Aligned Right */}
                    <div className="flex justify-end pt-4 mt-auto">
                      <Link
                        href="/courses"
                        className={buttonVariants({ 
                          className: "group/btn px-6 rounded-full font-medium transition-all hover:pr-5", 
                          variant: "outline" 
                        })}
                      >
                        Explore
                        <ChevronRight className="h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
                      </Link>
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
