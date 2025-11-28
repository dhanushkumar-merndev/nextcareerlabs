import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { stripe } from "@/lib/stripe";
import { headers } from "next/headers";
import { Stripe } from "stripe";

export const config = {
  api: {
    bodyParser: false, // Stripe requires raw body
  },
};

export async function POST(req: Request) {
  const body = await req.text();
  const headerList = await headers(); // <-- added await
  const signature = headerList.get("stripe-signature") as string;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      env.STRIPE_WEBHOOK_SECRET // must be test secret in prod
    );
  } catch {
    // cleaned - no console logs
    return new Response("Invalid Stripe Signature", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    const courseId = session.metadata?.courseId;
    const enrollmentId = session.metadata?.enrollmentId;
    const customerId = session.customer as string;

    if (!courseId || !enrollmentId) {
      return new Response("Missing metadata", { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { stripeCustomerId: customerId },
    });

    if (!user) {
      return new Response("User not found", { status: 404 });
    }

    await prisma.enrollment.update({
      where: { id: enrollmentId },
      data: {
        userId: user.id,
        courseId,
        amount: session.amount_total || 0,
        status: "Active",
      },
    });
  }

  return new Response("OK", { status: 200 });
}
