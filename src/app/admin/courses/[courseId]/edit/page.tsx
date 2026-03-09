import { EditCourseClientWrapper } from "./_components/EditCourseClientWrapper";

type Params = Promise<{ courseId: string }>;

export default async function EditRoute({ params }: { params: Params }) {
  const { courseId } = await params;

  return <EditCourseClientWrapper courseId={courseId} />;
}
