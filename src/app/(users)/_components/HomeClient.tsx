"use client";

import dynamic from "next/dynamic";

/* Client-only lazy components */
const HomePageUrlCleaner = dynamic(
  () => import("./HomePageUrlCleaner"),
  { ssr: false }
);

const Stacking = dynamic(() => import("./Stacking"), {
  ssr: false,
  loading: () => <div className="h-64" />,
});

const TestimonialBanner = dynamic(
  () => import("./TestimonialBanner"),
  {
    ssr: false,
    loading: () => <div className="h-48" />,
  }
);

export default function HomeClient() {
  return (
    <>
      <HomePageUrlCleaner />

      <section id="programs">
        <Stacking />
      </section>

      <section id="testimonials">
        <TestimonialBanner />
      </section>
    </>
  );
}
