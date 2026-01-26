// NOT optional
export type ApiResponse = {
  status: "success" | "error";
  message: string;
};

// NOT optional
export type UserRole = "admin" | "user";

// NOT optional
export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;

  emailVerified: Date | null;
  image?: string | null;

  role: UserRole;

  banned?: boolean | null;
  isSupportBanned?: boolean | null;
  phoneNumber?: string | null;

  createdAt: Date;
  updatedAt: Date;
}

// NOT optional
export interface AuthSession {
  user: AuthUser;
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
    token: string;

    createdAt: Date;
    updatedAt: Date;

    ipAddress?: string | null;
    userAgent?: string | null;
  };
}

// Helper type for provider result
export type AuthProviderResult =
  | { provider: "email" }
  | { provider: "google" }
  | { provider: "banned"; message?: string };

