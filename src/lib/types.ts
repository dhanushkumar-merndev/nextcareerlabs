export type ApiResponse = {
  status: "success" | "error";
  message: string;
};

export interface AuthUser {
    id: string;
    email: string;
    name: string;
    emailVerified: boolean;
    image?: string | null;
    createdAt: Date;
    updatedAt: Date;
    role?: string | null;
    banned?: boolean | null;
    phoneNumber?: string | null;
    isSupportBanned?: boolean | null;
}

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
