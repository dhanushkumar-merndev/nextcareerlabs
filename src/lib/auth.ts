import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./db";
import { env } from "./env";
import { redis } from "./redis";
import { emailOTP } from "better-auth/plugins";
import { resend } from "./resend";
import { admin } from "better-auth/plugins";

const date = new Date().getFullYear();

export const auth = betterAuth({
  trustedOrigins: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://192.168.1.2:3000", // your LAN IP
    "https://nextcareerlabs.online",
    "https://www.nextcareerlabs.online",
  ],  

  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  cache: {
    enabled: true,
    storage: {
      get: async (key: string) => {
        if (!redis) return null;
        return await redis.get(key);
      },
      set: async (key: string, value: string, ttl?: number) => {
        if (!redis) return;
        // Better Auth uses seconds for TTL
        await redis.set(key, value, "EX", ttl || 2592000); // Default 30 days
      },
      delete: async (key: string) => {
        if (!redis) return;
        await redis.del(key);
      },
    },
  },
  user: {
    additionalFields: {
      phoneNumber: {
        type: "string",
        required: false,
      },
      isSupportBanned: {
        type: "boolean",
        required: false,
      },
      banned: {
        type: "boolean",
        required: false,
      },
    },
  },
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      scope: ["openid", "email", "profile"],
      accessType: "offline",
      prompt: "select_account consent",
    },
  },
  account: {
    accountLinking: {
      enabled: false, // Prevent auto-linking accounts - users must use original auth method
    },
  },
  plugins: [
    emailOTP({
      async sendVerificationOTP({ email, otp }) {
        await resend.emails.send({
          from: "Skillforce Cloud <no-reply@nextcareerlabs.online>",
          to: [email],
          subject: "Skillforce Cloud - Verify your email",
          html: `<!-- Email Template for Skillforce Cloud -->
        <div style="
          font-family: 'Segoe UI', Arial, sans-serif;
          background-color: #f9fafb;
          padding: 30px;
          max-width: 430px;
          margin: auto;
          border-radius: 12px;
        ">
          <h2 style="
              margin: 0 0 12px;
              color: #1a202c; /* dark heading */
              font-size: 22px;
            ">
            Skillforce Cloud — Email Verification
          </h2>

          <p style="
              color: #4a5568;
              font-size: 15px;
              margin-bottom: 20px;
            ">
            To complete your login / signup, please enter the one-time password (OTP) below:
          </p>

          <div style="
              font-size: 30px;
              font-weight: 600;
              text-align: center;
              padding: 14px;
              background-color: #ffffff;
              border: 1px solid #e2e8f0;
              border-radius: 10px;
              letter-spacing: 5px;
              color: #2d3748;
            ">
            ${otp} 
          </div>

          <p style="
              color: #718096;
              font-size: 13px;
              margin-top: 24px;
            ">
            This OTP will expire in 10 minutes. If you didn’t request this, you can safely ignore this email.
          </p>

          <hr style="
              margin: 30px 0;
              border: 0;
              border-top: 1px solid #e2e8f0;
            ">

          <p style="
              color: #718096;
              font-size: 12px;
              text-align: center;
            ">
            © ${date} Skillforce Cloud. All rights reserved.
          </p>
        </div>
        `,
        });
      },
    }),
    admin(),
  ],
  databaseHooks: {
    user: {
        create: {
            after: async () => {
                const { incrementGlobalVersion, GLOBAL_CACHE_KEYS } = await import("./redis");
                await incrementGlobalVersion(GLOBAL_CACHE_KEYS.ADMIN_ANALYTICS_VERSION);
                console.log("[Auth Hook] New user joined. Invalidated analytics cache.");
            }
        }
    },
    session: {
        create: {
            after: async () => {
                const { incrementGlobalVersion, GLOBAL_CACHE_KEYS } = await import("./redis");
                await incrementGlobalVersion(GLOBAL_CACHE_KEYS.AUTH_SESSION_VERSION);
                console.log("[Auth Hook] Session created. Syncing all clients...");
            }
        },
        delete: {
            after: async () => {
                const { incrementGlobalVersion, GLOBAL_CACHE_KEYS } = await import("./redis");
                await incrementGlobalVersion(GLOBAL_CACHE_KEYS.AUTH_SESSION_VERSION);
                console.log("[Auth Hook] Session deleted. Syncing all clients...");
            }
        }
    }
  }
});
