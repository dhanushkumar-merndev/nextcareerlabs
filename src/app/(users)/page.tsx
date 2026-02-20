/**
 * Home Page (Fully Static + Optimized)
 */

export const dynamic = "force-static";
export const revalidate = 3600; // Cache on CDN for 1 hour, then background refresh
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import FeaturesSection from "./_components/FeaturesSection";
import HomeClient from "./_components/HomeClient";
import { BookTextIcon } from "@/components/ui/book-text";
import { LayersIcon } from "@/components/ui/layers";
import { ChartColumnIncreasingIcon } from "@/components/ui/chart-column-increasing";
import { UsersIcon } from "@/components/ui/users";
import HeroButtons from "./_components/HeroButtons";

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
      {/* HERO */}
      <main className="relative py-18 px-4 lg:px-10 lg:py-24 xl:py-28">
        <div className="mx-auto max-w-3xl space-y-6 text-center">
          <Badge variant="outline">The future of Online Education</Badge>

          <h1 className="text-4xl font-bold tracking-tight md:text-6xl">
            Elevate Your Learning Experience
          </h1>

          <p className="text-lg text-muted-foreground md:text-xl">
            Discover a new way to learn with our modern, interactive platform.
          </p>

          <HeroButtons />
        </div>
      </main>

      {/* FEATURES (Accordion behavior on mobile) */}
      <FeaturesSection features={features} />

      {/* Client-only sections */}
      <HomeClient />
    </>
  );
}
