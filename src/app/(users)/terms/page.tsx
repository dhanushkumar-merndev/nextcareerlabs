import { Badge } from "@/components/ui/badge";

export default function TermsPage() {
  return (
    <div className="container mx-auto px-4 py-20 max-w-4xl">
      <div className="space-y-8">
        <div className="space-y-4 text-center">
          <Badge variant="outline">Terms & Conditions</Badge>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">Terms of Use</h1>
          <p className="text-muted-foreground text-lg italic">
            Last updated: {new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>

        <div className="prose prose-slate dark:prose-invert max-w-none space-y-6 text-foreground/80 leading-relaxed">
          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground">1. Agreement to Terms</h2>
            <p>
              By accessing or using Skill Force Cloud, you agree to be bound by these Terms and Conditions. If you disagree with any part of these terms, you may not access the platform.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground">2. User Accounts</h2>
            <p>
              When you create an account with us, you must provide information that is accurate, complete, and current at all times. Failure to do so constitutes a breach of the Terms, which may result in immediate termination of your account on our platform.
            </p>
            <p>
              You are responsible for safeguarding the password that you use to access the service and for any activities or actions under your password.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground">3. Intellectual Property</h2>
            <p>
              The platform and its original content, features, and functionality are and will remain the exclusive property of Skill Force Cloud and its licensors. Our content is protected by copyright, trademark, and other laws.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground">4. Course Content & Access</h2>
            <p>
              Upon enrollment in a course, you are granted a limited, non-exclusive, non-transferable license to access and view the course content for which you have paid all required fees, solely for your personal, non-commercial, educational purposes.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground">5. Termination</h2>
            <p>
              We may terminate or suspend your account immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground">6. Limitation of Liability</h2>
            <p>
              In no event shall Skill Force Cloud, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
