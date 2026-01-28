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
