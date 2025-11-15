"use client";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import Link from "next/link";
interface featuresProps {
  title: string;
  description: string;
  icon: React.ElementType;
}

import { BookOpen, Layers, BarChart3, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const features: featuresProps[] = [
  {
    title: "Comprehensive Courses",
    description:
      "Access a wide range of carefully curated courses designed by industry experts.",
    icon: BookOpen,
  },
  {
    title: "Interactive Learning",
    description:
      "Engage with interactive content, quizzes, and assignments to enhance your learning experience.",
    icon: Layers,
  },
  {
    title: "Progress Tracking",
    description:
      "Monitor your progress and achievements with detailed analytics and personalized dashboards.",
    icon: BarChart3,
  },
  {
    title: "Community Support",
    description:
      "Join a vibrant community of learners and instructors to collaborate and share knowledge.",
    icon: Users,
  },
];

export default function Home() {
  const { data: session } = authClient.useSession();

  return (
    <>
      <section className="relative py-20">
        <div className="flex flex-col items-center text-center space-y-8">
          <Badge variant={"outline"}>The future of Online Education</Badge>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
            Elevate your Learning Experience
          </h1>
          <p className="max-w-[700px] text-muted-foreground text-xl">
            Discover a new way to learn with our mordern, interactive learning
            management system. Access high-quality course anytime, anywhere.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 mt-8 ">
            <Link className={buttonVariants({ size: "lg" })} href="/courses">
              Explore Courses
            </Link>
            <Link
              className={buttonVariants({ size: "lg", variant: "outline" })}
              href="/login"
            >
              Get Started
            </Link>
          </div>
        </div>
      </section>
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {features.map((feature, index) => {
          const Icon = feature.icon;

          return (
            <Card key={index} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="size-12 flex items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="w-8 h-8 text-primary" />
                </div>
                <CardTitle>{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{feature.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </section>
    </>
  );
}
