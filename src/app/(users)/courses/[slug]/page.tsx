import { checkIfCourseBought } from "@/app/data/user/user-is-enrolled";
import { SlugPageWrapper } from "./_components/SlugPageWrapper";
import { requireCompleteProfile } from "@/app/data/user/require-complete-profile";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getIndividualCourse } from "@/app/data/course/get-course";

type Params = Promise<{ slug: string }>;

export default async function SlugPage({ params }: { params: Params }) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  let isProfileComplete = true;

  if (session) {
    const profile = await requireCompleteProfile();
    isProfileComplete = profile.isComplete;
  }

  const { slug } = await params;
  const course = await getIndividualCourse(slug);
  const enrollmentStatus = await checkIfCourseBought(course.id);

  return (
    <SlugPageWrapper 
      course={course} 
      enrollmentStatus={enrollmentStatus} 
      isProfileComplete={isProfileComplete}
    />
  );
}
