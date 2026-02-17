"use client";

import { useState } from "react";
import Image from "next/image";

import { Testimonial } from "@/lib/types/components";

/* ================= DATA ================= */
const testimonials: Testimonial[] = [
  {
    id: 1,
    name: "Emily Ewing",
    role: "Developer",
    company: "Alpha",
    message:
      "Lorem ipsum, dolor sit amet consectetur adipisicing elit. Assumenda, veritatis repellendus atque unde voluptatibus provident in?",
    avatar: "/testimonials/12.jpg",
  },
  {
    id: 2,
    name: "John Schnobrich",
    role: "Designer",
    company: "Beta",
    message:
      "Lorem ipsum dolor sit amet consectetur adipisicing elit. Aperiam corrupti laudantium cum!",
    avatar: "/testimonials/18.jpg",
  },
  {
    id: 3,
    name: "Brooke Cagle",
    role: "CEO",
    company: "Gamma",
    message:
      "Lorem ipsum dolor sit amet, consectetur adipisicing elit. Est et culpa velit praesentium.",
    avatar: "/testimonials/44.jpg",
  },
  {
    id: 4,
    name: "Bingo",
    role: "Mascot",
    company: "Alpha",
    message: "Lorem ipsum dolor sit amet.",
    avatar: "/testimonials/65.jpg",
    image: "/testimonials/photo-1504384308090-c894fdcc538d.jpg",
  },
  {
    id: 5,
    name: "Charles Forerunner",
    role: "VP Finance",
    company: "Delta",
    message:
      "Lorem ipsum dolor, sit amet consectetur adipisicing elit. Asperiores dicta necessitatibus maiores nostrum.",
    avatar: "/testimonials/33.jpg",
  },
  {
    id: 6,
    name: "Annie Spratt",
    role: "CEO",
    company: "Gamma",
    message:
      "Lorem ipsum dolor sit amet consectetur adipisicing elit. Omnis, fuga magnam.",
    avatar: "/testimonials/68.jpg",
  },
  {
    id: 7,
    name: "Tyler Franta",
    role: "Partner",
    company: "Beta",
    message:
      "Lorem ipsum dolor sit amet consectetur, adipisicing elit. Enim placeat reiciendis iusto!",
    avatar: "/testimonials/52.jpg",
  },
  {
    id: 8,
    name: "Sean Pollock",
    role: "Product",
    company: "Beta",
    message:
      "Lorem ipsum dolor sit amet consectetur adipisicing elit. Necessitatibus, accusamus suscipit.",
    avatar: "/testimonials/75.jpg",
  },
];

/* ================= CARD ================= */
function TestimonialCard({ t }: { t: Testimonial }) {
  return (
    <div className="break-inside-avoid mb-6 rounded-2xl bg-card border border-border overflow-hidden hover:border-primary/40 hover:shadow-md transition-all duration-200">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-3">
        <img
          src={t.avatar}
          alt={t.name}
          className="size-10 rounded-full object-cover ring-2 ring-border"
          loading="lazy"
          referrerPolicy="no-referrer"
          crossOrigin="anonymous"
        />
        <div>
          <p className="text-sm font-semibold text-card-foreground leading-none mb-1">
            {t.name}
          </p>
          <p className="text-xs text-muted-foreground">
            {t.role} · {t.company}
          </p>
        </div>
      </div>

      {/* Message */}
      <p className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed">
        {t.message}
      </p>

      {/* Optional image */}
      {t.image && (
        <div className="relative w-full aspect-video">
          <Image
            src={t.image}
            alt="testimonial media"
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            crossOrigin="anonymous"
          />
        </div>
      )}
    </div>
  );
}

/* ================= SECTION ================= */
export default function TestimonialMasonry() {
  const [showAll, setShowAll] = useState(false);

  return (
    <section className="pt-10 md:pt-20 px-4">
      <div className="mx-auto max-w-6xl">

        {/* ── Header ── */}
        <div className="mb-12 md:mb-18 text-center">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground">
            What people are saying
          </h2>

        </div>

        {/* ── Grid ── */}
        <div className="relative">
          <div
            className={`columns-1 sm:columns-2 lg:columns-3 gap-6 transition-[max-height] duration-500 ${
              !showAll ? "max-h-[540px] md:max-h-[860px] overflow-hidden" : ""
            }`}
          >
            {testimonials.map((t) => (
              <TestimonialCard key={t.id} t={t} />
            ))}
          </div>

          {/* Fade + show more */}
          {!showAll && (
            <>
              <div className="pointer-events-none absolute bottom-0 inset-x-0 h-40 md:h-52 bg-linear-to-t from-background via-background/90 to-transparent" />
              <div className="absolute bottom-4 inset-x-0 flex justify-center">
                <button
                  onClick={() => setShowAll(true)}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold backdrop-blur-md bg-white/10 dark:bg-white/5 border border-white/30 dark:border-white/10 text-foreground shadow-[0_4px_24px_0_rgba(0,0,0,0.08)] hover:bg-white/20 dark:hover:bg-white/10 hover:border-white/50 active:scale-95 transition-all duration-200"
                >
                  Show more stories
                </button>
              </div>
            </>
          )}
        </div>

        {/* Show less */}
        {showAll && (
          <div className="mt-10 flex justify-center">
            <button
              onClick={() => setShowAll(false)}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full border border-border text-sm font-medium text-foreground hover:bg-accent transition-colors duration-150"
            >
              Show less
            </button>
          </div>
        )}
      </div>
    </section>
  );
}