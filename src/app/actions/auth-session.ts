"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getCache, setCache, GLOBAL_CACHE_KEYS, getGlobalVersion, incrementGlobalVersion } from "@/lib/redis";

const SESSION_CACHE_TTL = 21600; // 6 hours in seconds

export async function getAuthSessionAction(clientVersion?: string) {
    // 1. Version Check
    let currentVersion = await getGlobalVersion(GLOBAL_CACHE_KEYS.AUTH_SESSION_VERSION);

    if (currentVersion === "0") {
        console.log(`[AuthAction] Version key missing. Initializing...`);
        await incrementGlobalVersion(GLOBAL_CACHE_KEYS.AUTH_SESSION_VERSION);
        currentVersion = await getGlobalVersion(GLOBAL_CACHE_KEYS.AUTH_SESSION_VERSION);
    }

    // 2. Client-Side Match (Heartbeat)
    if (clientVersion && clientVersion === currentVersion) {
        console.log(`[AuthAction] Heartbeat: Version Match (${clientVersion}). Returning NOT_MODIFIED.`);
        return { status: "not-modified", version: currentVersion };
    }

    console.log(`[AuthAction] Cache MISS or MISMATCH (Client: ${clientVersion || 'None'}, Server: ${currentVersion}). Fetching...`);

    // 3. Fetch Fresh Session
    const headersList = await headers();
    const cookieHeader = headersList.get("cookie");
    console.log(`[AuthAction] Fetching session. Cookie present: ${!!cookieHeader}`);

    const session = await auth.api.getSession({
        headers: headersList,
    });

    if (!session) {
        return { data: null, version: currentVersion };
    }

    // 4. Return Data and Server Version
    return {
        data: session,
        version: currentVersion
    };
}
