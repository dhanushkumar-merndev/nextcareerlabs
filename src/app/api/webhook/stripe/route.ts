import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { stripe } from "@/lib/stripe";
import { headers } from "next/headers";
import { Stripe } from "stripe";

// Add these configurations
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.text();
  const headerList = await headers();
  const signature = headerList.get("Stripe-Signature") as string;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    console.error("Webhook signature verification failed:", error);
    return new Response("Webhook Error", { status: 400 });
  }

  const session = event.data.object as Stripe.Checkout.Session;

  if (event.type === "checkout.session.completed") {
    try {
      const courseId = session.metadata?.courseId;
      const enrollmentId = session.metadata?.enrollmentId;
      const customerId = session.customer as string;

      if (!courseId) {
        console.error("Course ID not found in session metadata");
        return new Response("Course ID missing", { status: 400 });
      }

      if (!enrollmentId) {
        console.error("Enrollment ID not found in session metadata");
        return new Response("Enrollment ID missing", { status: 400 });
      }

      const user = await prisma.user.findUnique({
        where: {
          stripeCustomerId: customerId,
        },
      });

      if (!user) {
        console.error(`User not found for customer ID: ${customerId}`);
        return new Response("User not found", { status: 400 });
      }

      await prisma.enrollment.update({
        where: {
          id: enrollmentId,
        },
        data: {
          userId: user.id,
          courseId: courseId,
          amount: session.amount_total as number,
          status: "Active",
        },
      });

      console.log(
        `✅ Enrollment ${enrollmentId} activated for user ${user.id}`
      );
    } catch (error) {
      console.error("Error processing checkout session:", error);
      return new Response("Processing error", { status: 500 });
    }
  }

  return new Response(null, { status: 200 });
}
