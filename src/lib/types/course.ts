export interface CoursesProps {
  data: PublicCourseType;
  enrollmentStatus?: string | null;
}

export interface CoursesClientProps {
    currentUserId?: string;
}


export type PublicCourseType = {
  id: string;
  title: string;
  smallDescription: string;
  duration: number; 
  level: string;
  fileKey: string | null;
  category: string;
  slug: string;
  enrollmentStatus?: string | null;
};

export type Course = PublicCourseType;

export type CoursesCacheEntry = {
  data: Course[];
  version: string;
};

/**
 * What the SERVER can return internally
 * (client never stores this directly)
 */


export type CoursesServerResult =
  | {
      status: "not-modified";
      version: string;
    }
  | {
      status: "data";
      version: string;
      courses: PublicCourseType[];
    };
