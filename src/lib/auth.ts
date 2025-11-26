import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./db";
import { env } from "./env";
import { emailOTP } from "better-auth/plugins";
import { resend } from "./resend";
import type { User, Session } from "@/generated/prisma";
import { admin } from "better-auth/plugins";

export const auth = betterAuth({
  // ✅ PRODUCTION URL
  baseURL: "https://nextcareerlabs.online",

  // ✅ TRUSTED ORIGINS
  trustedOrigins: [
    "https://nextcareerlabs.online", // production
    "http://localhost:3000", // local dev

    // DON'T add 192.168.x.x here in production
  ],

  // ✅ DATABASE
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  // ✅ SOCIAL PROVIDERS
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      scope: ["openid", "email", "profile"],
      accessType: "offline",
      prompt: "select_account consent",
    },
  },

  // ✅ EVENTS (WORKS FOR GOOGLE + OTP + ALL)
  events: {
    "session:created": async ({
      session,
      user,
    }: {
      session: Session;
      user: User;
    }) => {
      console.log("SESSION CREATED FOR:", user.email);

      await prisma.session.deleteMany({
        where: {
          userId: user.id,
          token: { not: session.token }, // keep only latest session
        },
      });
    },
  },

  // ✅ PLUGINS
  plugins: [
    emailOTP({
      async sendVerificationOTP({ email, otp }) {
        await resend.emails.send({
          from: "Next Career Labs <no-reply@nextcareerlabs.online>",
          to: [email],
          subject: "Next Career Labs - Verify your email",
          html: `
          <h2>Next Career Labs — Email Verification</h2>
          <p>Your OTP is:</p>
          <h1>${otp}</h1>
          <p>Expires in 10 minutes.</p>
        `,
        });
      },
    }),
    admin(),
  ],
});
