/**
 * Home Page (Fully Static + Optimized)
 */

export const dynamic = "force-static";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { FeatureCard } from "./_components/FeatureCard";
import HomeClient from "./_components/HomeClient";
import { BookTextIcon } from "@/components/ui/book-text";
import { LayersIcon } from "@/components/ui/layers";
import { ChartColumnIncreasingIcon } from "@/components/ui/chart-column-increasing";
import { UsersIcon } from "@/components/ui/users";

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

          <div className="flex flex-col gap-4 justify-center max-w-40 mx-auto pt-4 md:flex-row sm:justify-center">
            <Link
              href="/courses"
              className={buttonVariants({ size: "lg" })}
            >
              Explore Courses
            </Link>

            <Link
              href="/dashboard"
              className={buttonVariants({
                size: "lg",
                variant: "outline",
              })}
            >
              Go to Dashboard
            </Link>
          </div>
        </div>
      </main>

      {/* FEATURES (Server-rendered & fast) */}
      <section className="grid grid-cols-1 gap-6 px-4 pb-8 md:grid-cols-2 lg:grid-cols-4 lg:px-6 xl:pb-16">
        {features.map(feature => (
          <FeatureCard key={feature.title} {...feature} />
        ))}
      </section>

      {/* Client-only sections */}
      <HomeClient />
    </>
  );
}
