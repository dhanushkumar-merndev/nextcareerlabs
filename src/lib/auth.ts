import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./db";
import { env } from "./env";
import { emailOTP } from "better-auth/plugins";
import { resend } from "./resend";
import { admin } from "better-auth/plugins";
export const auth = betterAuth({
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
  plugins: [
    emailOTP({
      async sendVerificationOTP({ email, otp }) {
        await resend.emails.send({
          from: "Next Career Labs <onboarding@resend.dev>",
          to: [email],
          subject: "Next Career Labs - Verify your email",
          html: `<p>Your OTP is <strong>${otp}</strong></p>  `,
        });
      },
    }),
    admin(),
  ],
});
