"use server";

import { requireUser } from "@/app/data/user/require-user";
import arcjet, { fixedWindow } from "@/lib/arcjet";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { stripe } from "@/lib/stripe";
import { ApiResponse } from "@/lib/types";
import { request } from "@arcjet/next";
import { redirect } from "next/navigation";
import Stripe from "stripe";

const aj = arcjet.withRule(
  fixedWindow({
    mode: "LIVE",
    window: "1m",
    max: 5,
  })
);

export async function enrollInCourseAction(
  courseId: string
): Promise<ApiResponse | never> {
  const user = await requireUser();

  let checkoutUrl: string;

  try {
    const req = await request();
    const decision = await aj.protect(req, {
      fingerprint: user.id,
    });

    if (decision.isDenied()) {
      return {
        status: "error",
        message: "You have be blocked",
      };
    }
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        title: true,
        price: true,
        slug: true,
      },
    });

    if (!course) {
      return {
        status: "error",
        message: "Course not found",
      };
    }

    const userWithStripeCustomerId = await prisma.user.findUnique({
      where: { id: user.id }, // FIXED
      select: { stripeCustomerId: true },
    });

    let stripeCustomerId = userWithStripeCustomerId?.stripeCustomerId;

    // Verify the customer exists in Stripe and is not deleted
    if (stripeCustomerId) {
      try {
        const customer = await stripe.customers.retrieve(stripeCustomerId);
        if (customer.deleted) {
          // The customer was deleted in Stripe, so we'll create a new one
          stripeCustomerId = null;
        }
      } catch {
        // The customer ID is invalid or doesn't exist, so we'll create a new one
        stripeCustomerId = null;
      }
    }

    // If we don't have a valid customer ID, create a new customer in Stripe
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: { userId: user.id },
      });
      stripeCustomerId = customer.id;

      await prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId: stripeCustomerId },
      });
    }
    const result = await prisma.$transaction(async (tx) => {
      const exisitingEnrollment = await tx.enrollment.findUnique({
        where: {
          userId_courseId: {
            userId: user.id,
            courseId: course.id, // FIXED
          },
        },
        select: { id: true, status: true },
      });

      if (exisitingEnrollment?.status === "Active") {
        return {
          status: "success",
          message: "you are already enrolled in this course",
        };
      }

      let enrollment;

      if (exisitingEnrollment) {
        enrollment = await tx.enrollment.update({
          where: { id: exisitingEnrollment.id },
          data: {
            amount: course.price,
            status: "Pending",
            updatedAt: new Date(),
          },
        });
      } else {
        enrollment = await tx.enrollment.create({
          data: {
            userId: user.id,
            courseId: course.id,
            amount: course.price,
            status: "Pending",
          },
        });
      }

      const checkoutSession = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        line_items: [
          {
            price_data: {
              currency: "inr",
              product_data: {
                name: course.title,
                description: `Enrollment in the course: ${course.title}`,
              },
              unit_amount: course.price * 100, // Convert to cents
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: `${env.BETTER_AUTH_URL}/payment/success`,
        cancel_url: `${env.BETTER_AUTH_URL}/payment/cancel`,
        metadata: {
          userId: user.id,
          courseId: course.id,
          enrollmentId: enrollment.id,
        },
      });

      return {
        enrollment,
        checkourUrl: checkoutSession.url,
      };
    });

    checkoutUrl = result.checkourUrl as string;
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError) {
      // Log the detailed error for debugging on the server
      console.error("Stripe API Error:", error.message);
      console.error("Stripe Error Type:", error.type);

      return {
        status: "error",
        message: "Payment system error. Please try again later",
      };
    }
    return {
      status: "error",
      message: "Failed to Enroll in Course",
    };
  }

  redirect(checkoutUrl);
}
