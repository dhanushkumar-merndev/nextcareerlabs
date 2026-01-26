import { PublicCourseType } from "@/app/data/course/get-all-courses";

export interface iAppProps {
  data: PublicCourseType;
  enrollmentStatus?: string | null;
}
