import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

interface iAppProps {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
}
export default async function CourseSulgPage({ params }: iAppProps) {
  const { slug } = await params;
  
  // Targeted query to find the first lesson for redirect, rather than fetching full sidebar data
  const firstLesson = await prisma.lesson.findFirst({
    where: {
      Chapter: {
        Course: {
          slug: slug
        }
      }
    },
    orderBy: [
      { Chapter: { position: 'asc' } },
      { position: 'asc' }
    ],
    select: { id: true }
  });

  if (firstLesson) {
    redirect(`/dashboard/${slug}/${firstLesson.id}`);
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center px-4">
      <h2 className="text-2xl font-bold mb-2">No lessons Available</h2>
      <p className="text-muted-foreground">
        This course does not have any lessons yet.
      </p>
    </div>
  );
}
