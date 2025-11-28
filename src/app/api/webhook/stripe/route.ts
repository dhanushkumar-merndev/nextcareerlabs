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

  const signature =
    headerList.get("stripe-signature") ?? headerList.get("Stripe-Signature");

  if (!signature) {
    return new Response("Missing signature", { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      env.STRIPE_WEBHOOK_SECRET
    );
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    if (!session.metadata?.courseId || !session.metadata?.enrollmentId) {
      return new Response("No LMS metadata, ignored", { status: 200 });
    }

    const user = await prisma.user.findUnique({
      where: { stripeCustomerId: session.customer as string },
    });

    if (!user) return new Response("User not found", { status: 404 });

    await prisma.enrollment.update({
      where: { id: session.metadata.enrollmentId },
      data: {
        userId: user.id,
        courseId: session.metadata.courseId,
        amount: session.amount_total ?? 0,
        status: "Active",
      },
    });
  }

  return new Response("OK", { status: 200 });
}
