/**
 * Home Page
 *
 * - Public landing page for the platform
 * - Highlights core features and value proposition
 * - Provides entry points to courses and dashboard
 * - Includes testimonials and program overview sections
 */

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { FeatureCard } from "./_components/FeatureCard";
import Stacking from "./_components/Stacking";
import { BookTextIcon } from "@/components/ui/book-text";
import { LayersIcon } from "@/components/ui/layers";
import { ChartColumnIncreasingIcon } from "@/components/ui/chart-column-increasing";
import { UsersIcon } from "@/components/ui/users";
import TestimonialBanner from "./_components/TestimonialBanner";
import { DashboardButton } from "./_components/DashboardButton";
import HomePageUrlCleaner from "./_components/HomePageUrlCleaner";

// Feature highlights shown on the homepage
const features = [
  {
    title: "Comprehensive Courses",
    description:
      "Access a wide range of carefully curated courses designed by industry experts.",
    Icon: BookTextIcon,
  },
  {
    title: "Interactive Learning",
    description: "Engage with interactive content, quizzes, and assignments.",
    Icon: LayersIcon,
  },
  {
    title: "Progress Tracking",
    description:
      "Monitor your achievements with detailed analytics and dashboards.",
    Icon: ChartColumnIncreasingIcon,
  },
  {
    title: "Community Support",
    description:
      "Join a vibrant community of learners and instructors to collaborate.",
    Icon: UsersIcon,
  },
];

export default function Home() {
  return (
    <>
      {/* Cleans up unwanted URL params on homepage */}
      <HomePageUrlCleaner />

      {/* HERO SECTION */}
      <main className="relative py-18 px-4 lg:px-10 lg:py-24 xl:py-28">
        <div className="flex flex-col items-center text-center max-w-3xl mx-auto space-y-6">
          <Badge variant="outline">The future of Online Education</Badge>

          <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
            Elevate Your Learning Experience
          </h1>

          <p className="max-w-162.5 text-muted-foreground text-lg md:text-xl">
            Discover a new way to learn with our modern, interactive platform.
          </p>

          {/* Primary actions */}
          <div className="flex flex-col sm:flex-row gap-4 pt-4">
            <Link className={buttonVariants({ size: "lg" })} href="/courses">
              Explore Courses
            </Link>
            <DashboardButton />
          </div>
        </div>
      </main>

      {/* FEATURES SECTION */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 px-4 lg:px-6 pb-8 xl:pb-16">
        {features.map(feature => (
          <FeatureCard key={feature.title} {...feature} />
        ))}
      </section>

      {/* PROGRAMS SECTION */}
      <section id="programs">
        <Stacking />
      </section>

      {/* TESTIMONIALS SECTION */}
      <section id="testimonials">
        <TestimonialBanner />
      </section>
    </>
  );
}
