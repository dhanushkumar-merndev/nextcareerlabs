export interface User {
  id: string;
  name: string;
  email: string;
  role: string | null;
  createdAt: Date;
  image: string | null;
  phoneNumber: string | null;
  _count: {
    enrollment: number;
  };
}

export interface UserListProps {
  initialUsers: User[];
  initialHasNextPage: boolean;
  initialTotalUsers: number;
  search: string;
}

export interface ChapterExpansionProps {
    chapter: {
        id: string;
        title: string;
        position: number;
        lesson: any[];
    };
    children: React.ReactNode;
}

export interface PageProps {
    params: Promise<{
        userId: string;
        courseId: string;
    }>;
}
