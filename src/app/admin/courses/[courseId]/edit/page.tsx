import { adminGetCourse } from "@/app/data/admin/admin-get-course";
import { EditCourseClientWrapper } from "./_components/EditCourseClientWrapper";

type Params = Promise<{ courseId: string }>;

export default async function EditRoute({ params }: { params: Params }) {
  const { courseId } = await params;
  const data = await adminGetCourse(courseId);

  return <EditCourseClientWrapper data={data} />;
}
