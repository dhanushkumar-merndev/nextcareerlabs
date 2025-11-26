import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./db";
import { env } from "./env";
import { emailOTP } from "better-auth/plugins";
import { resend } from "./resend";
import type { User, Session } from "@/generated/prisma";
import { admin } from "better-auth/plugins";

const date = new Date().getFullYear();

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
  events: {
    async "session.created"({
      session,
      user,
    }: {
      session: Session;
      user: User;
    }) {
      await prisma.$transaction(async (tx) => {
        await tx.session.deleteMany({
          where: {
            userId: user.id,
            id: { not: session.id },
          },
        });
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
          html: `<!-- Email Template for Next Career Labs -->
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
    Next Career Labs — Email Verification
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
    © ${date} Next Career Labs. All rights reserved.
  </p>
</div>
`,
        });
      },
    }),
    admin(),
  ],
});
