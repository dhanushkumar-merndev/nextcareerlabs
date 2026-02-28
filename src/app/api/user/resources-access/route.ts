import { getCurrentUser } from "@/lib/session";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCache, setCache, getGlobalVersion, GLOBAL_CACHE_KEYS } from "@/lib/redis";

export async function GET(req: Request) {
    try {
        const user = await getCurrentUser();
        if (!user) return new NextResponse("Unauthorized", { status: 401 });

        const { searchParams } = new URL(req.url);
        const clientVersion = searchParams.get("version");

        // Use USER_VERSION for invalidation
        const userVersion = await getGlobalVersion(GLOBAL_CACHE_KEYS.USER_VERSION(user.id));
        const currentVersion = userVersion;

        if (clientVersion && clientVersion === currentVersion) {
            return NextResponse.json({ status: "not-modified", version: currentVersion });
        }

        const cacheKey = `user:resources_access:${user.id}:${currentVersion}`;
        const cached = await getCache<boolean>(cacheKey);

        if (cached !== null) {
            return NextResponse.json({ hasAccess: cached, version: currentVersion });
        }

        const enrollmentCount = await prisma.enrollment.count({
            where: {
                userId: user.id,
                status: "Granted",
            },
        });

        const hasAccess = enrollmentCount > 0;
        await setCache(cacheKey, hasAccess, 2592000); // 30 days

        return NextResponse.json({ hasAccess, version: currentVersion });
    } catch (error) {
        console.error("[Resources Access API Error]", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
