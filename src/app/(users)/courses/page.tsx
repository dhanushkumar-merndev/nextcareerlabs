import { CoursesClient } from "./_components/CoursesClient";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PublicCoursesRoute() {
  const user = await getCurrentUser();

  return (
    <div className="mt-5 px-4 lg:px-6 md:mb-40">
      <div className="flex flex-col space-y-2 mb-10">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tighter">
          Explore Courses
        </h1>
        <p className="text-muted-foreground">
          Discover our wide range of courses designed to help you achieve your
          learning goals.
        </p>
      </div>

      <CoursesClient currentUserId={user?.id} />
    </div>
  );
}
