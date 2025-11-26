import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./db";
import { env } from "./env";
import { emailOTP } from "better-auth/plugins";
import { resend } from "./resend";
import { admin } from "better-auth/plugins";
import type { User, Session } from "@/generated/prisma";

export const auth = betterAuth({
  baseURL: "https://nextcareerlabs.online",

  trustedOrigins: [
    "https://nextcareerlabs.online",
    "http://localhost:3000",
    "http://192.168.1.2:3000",
  ],

  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      scope: ["openid", "email", "profile"],
      accessType: "offline",
      prompt: "select_account consent",
    },
  },

  // ✅ Correct event signature for your Better Auth version
  events: {
    "session:created": async ({
      session,
      user,
    }: {
      session: Session;
      user: User;
    }) => {
      console.log("SESSION CREATED FOR:", user.email);

      // DELETE ALL OTHER SESSIONS EXCEPT CURRENT ONE
      await prisma.session.deleteMany({
        where: {
          userId: user.id,
          token: { not: session.token },
        },
      });
    },
  },

  plugins: [
    emailOTP({
      async sendVerificationOTP({ email, otp }) {
        await resend.emails.send({
          from: "Next Career Labs <no-reply@nextcareerlabs.online>",
          to: [email],
          subject: "Next Career Labs - Verify your email",
          html: `<h2>Verify Email</h2><h1>${otp}</h1>`,
        });
      },
    }),

    admin(),
  ],
});
