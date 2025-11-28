import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { stripe } from "@/lib/stripe";
import { headers } from "next/headers";
import { Stripe } from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.text();
  const headerList = await headers();
  const signature = headerList.get("stripe-signature") as string;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      env.STRIPE_WEBHOOK_SECRET // must be test secret if you're using test mode
    );
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    // Ignore Stripe CLI fake events (they have no metadata)
    if (!session.metadata?.courseId || !session.metadata?.enrollmentId) {
      return new Response("No LMS metadata, ignored", { status: 200 });
    }

    const courseId = session.metadata.courseId;
    const enrollmentId = session.metadata.enrollmentId;
    const customerId = session.customer as string;

    // Validate DB user using stripeCustomerId
    const user = await prisma.user.findUnique({
      where: { stripeCustomerId: customerId },
    });

    if (!user) {
      return new Response("User not found", { status: 404 });
    }

    // Update enrollment => Active
    await prisma.enrollment.update({
      where: { id: enrollmentId },
      data: {
        userId: user.id,
        courseId,
        amount: session.amount_total ?? 0,
        status: "Active",
      },
    });
  }

  return new Response("OK", { status: 200 });
}
