import { auth } from "@/lib/auth";
import { headers } from "next/headers";

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
import AuthErrorHandler from "@/components/AuthErrorHandler";

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

export default async function Home() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const dashboardHref =
    session?.user.role === "admin" ? "/admin" : "/dashboard";

  return (
    <>
<AuthErrorHandler />
      {/* HERO */}
      <main className="relative py-18 px-4 lg:px-10 lg:py-24 xl:py-28">
        <div className="flex flex-col items-center text-center max-w-3xl mx-auto space-y-6">
          <Badge variant="outline">The future of Online Education</Badge>

          <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
            Elevate Your Learning Experience
          </h1>

          <p className="max-w-162.5 text-muted-foreground text-lg md:text-xl">
            Discover a new way to learn with our modern, interactive platform.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 pt-4">
            <Link className={buttonVariants({ size: "lg" })} href="/courses">
              Explore Courses
            </Link>
            <Link
              className={buttonVariants({ size: "lg", variant: "outline" })}
              href={session ? dashboardHref : "/dashboard"}
            >
              {session ? "Goto Dashboard" : "Get Started"}
            </Link>
          </div>
        </div>
      </main>

      {/* FEATURES */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 px-4 lg:px-6 pb-8 xl:pb-16">
        {features.map((feature) => (
          <FeatureCard key={feature.title} {...feature} />
        ))}
      </section>

      {/* SECTIONS */}
      <section id="programs">
        <Stacking />
      </section>
      <section id="testimonials">
        <TestimonialBanner />
      </section>
    </>
  );
}
