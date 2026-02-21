"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {  GLOBAL_CACHE_KEYS, getGlobalVersion, incrementGlobalVersion } from "@/lib/redis";
import { clearOtherSessionsOnce } from "@/lib/session-cleanup";


export async function getAuthSessionAction(clientVersion?: string) {
    // 1. Early return if no session cookie exists (Avoids Redis & DB for public users)
    const headersList = await headers();
    const cookieHeader = headersList.get("cookie") || "";
    const hasSessionCookie = cookieHeader.includes("better-auth.session_token") || cookieHeader.includes("next-auth.session-token");

    if (!hasSessionCookie) {
        if (clientVersion === "unauthenticated") {
            return { status: "not-modified", version: "unauthenticated" };
        }
        return { data: null, version: "unauthenticated" };
    }

    // 2. Version Check (Only hits Redis if there's an actual session cookie)
    let currentVersion = await getGlobalVersion(GLOBAL_CACHE_KEYS.AUTH_SESSION_VERSION);

    if (currentVersion === "0") {
        console.log(`[AuthAction] Version key missing. Initializing...`);
        await incrementGlobalVersion(GLOBAL_CACHE_KEYS.AUTH_SESSION_VERSION);
        currentVersion = await getGlobalVersion(GLOBAL_CACHE_KEYS.AUTH_SESSION_VERSION);
    }

    // 3. Client-Side Match (Heartbeat)
    if (clientVersion && clientVersion === currentVersion) {
        console.log(`[AuthAction] Heartbeat: Version Match (${clientVersion}). Returning NOT_MODIFIED.`);
        return { status: "not-modified", version: currentVersion };
    }

    console.log(`[AuthAction] Cache MISS or MISMATCH (Client: ${clientVersion || 'None'}, Server: ${currentVersion}). Fetching...`);

    // 3. Fetch Fresh Session
    console.log(`[AuthAction] Fetching session. Session Cookie present: ${hasSessionCookie}`);

    const session = await auth.api.getSession({
        headers: headersList,
    });

    // 4. Cleanup side-effect (Non-blocking)
    if (session) {
        clearOtherSessionsOnce(session.user.id, session.session.id)
            .catch(e => console.error("[AuthAction] Cleanup failed:", e));
    }

    // 5. Return Data and Server Version
    return {
        data: session,
        version: currentVersion
    };
}
