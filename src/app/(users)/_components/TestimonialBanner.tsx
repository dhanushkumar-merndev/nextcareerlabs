"use client";

import { useState } from "react";
import Image from "next/image";
import { Twitter } from "lucide-react";

/* ================= TYPES ================= */
type Testimonial = {
  id: number;
  name: string;
  role: string;
  company: string;
  message: string;
  avatar: string;
  image?: string;
};
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

/* ================= COMPONENT ================= */
export default function TestimonialMasonry() {
  const [showAll, setShowAll] = useState(false);

  return (
    <section className="pt-16 md:py-28 px-4 ">
      <div className="mx-auto max-w-7xl">
        {/* TITLE */}
        <div className="mb-12 text-center">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight">
            What people are saying
          </h2>
          <p className="mt-3 text-muted-foreground">
            Real feedback from our community
          </p>
        </div>

        {/* GRID WRAPPER */}
        <div className="relative">
          {/* MASONRY GRID */}
          <div
            className={`columns-1 sm:columns-2 lg:columns-3 gap-6 space-y-6 transition-[max-height] duration-500 ${
              !showAll ? "max-h-[900px] overflow-hidden" : ""
            }`}
          >
            {testimonials.map((t) => (
              <div
                key={t.id}
                className="break-inside-avoid rounded-xl bg-background border shadow-sm hover:shadow-md transition"
              >
                {/* HEADER */}
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <img
                      src={t.avatar}
                      alt={t.name}
                      className="h-10 w-10 rounded-full object-cover"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      crossOrigin="anonymous"
                    />
                    <div>
                      <p className="font-semibold leading-none">{t.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {t.role}, {t.company}
                      </p>
                    </div>
                  </div>
                  <Twitter className="h-5 w-5 text-sky-500" />
                </div>

                {/* MESSAGE */}
                <div className="px-4 pb-4 text-sm leading-relaxed">
                  {t.message}
                </div>

                {/* IMAGE */}
                {t.image && (
                  <div className="relative w-full aspect-video overflow-hidden rounded-b-xl">
                    <Image
                      src={t.image}
                      alt="testimonial image"
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                      crossOrigin="anonymous"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* FADE + BUTTON (OVERLAY) */}
          {!showAll && (
            <>
              <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-48 bg-linear-to-t from-background to-transparent" />

              <div className="absolute bottom-0 md:-bottom-10 left-1/2 -translate-x-1/2">
                <button
                  onClick={() => setShowAll(true)}
                  className="rounded-md border bg-background/70 px-6 py-2 text-sm font-medium backdrop-blur hover:bg-accent transition"
                >
                  Show more stories
                </button>
              </div>
            </>
          )}
        </div>

        {/* SHOW LESS */}
        {showAll && (
          <div className="mt-8 flex justify-center">
            <button
              onClick={() => setShowAll(false)}
              className="rounded-md border px-6 py-2 text-sm font-medium hover:bg-accent transition"
            >
              Show less
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
