/**
 * TermsPage Component
 *
 * - Displays Terms & Conditions using animated accordion sections
 * - Uses Framer Motion for smooth expand/collapse transitions
 * - Covers legal, usage, liability, and governing law information
 * - Includes trust indicators and contact details
 */

"use client";

import { useState } from "react";
import {
  FileText,
  AlertCircle,
  Shield,
  ChevronRight,
  Phone,
  Mail,
  LocateFixed,
  Lock,
  UserCheck,
  Database,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export default function TermsPage() {
  // Tracks the currently expanded section
  const [activeSection, setActiveSection] = useState<string | null>(null);

  // Terms & Conditions sections configuration
  const sections = [
    {
      id: "agreement",
      icon: Shield,
      title: "Agreement to Terms",
      content:
        "By accessing or using Skill Force Cloud (https://skillforcecloud.com), you acknowledge that you have read, understood, and agree to be bound by these Terms and Conditions. If you do not agree with any part of these terms, you must not use our platform.",
    },
    {
      id: "accounts",
      icon: UserCheck,
      title: "User Accounts",
      content:
        "When you create an account with us, you must provide information that is accurate, complete, and current at all times.",
      items: [
        "You are responsible for safeguarding your account credentials.",
        "You must notify us immediately upon becoming aware of any breach of security or unauthorized use of your account.",
        "We reserve the right to terminate accounts that violate our safety policies.",
      ],
    },
    {
      id: "intellectual",
      icon: Lock,
      title: "Intellectual Property",
      content:
        "The platform and its original content, features, and functionality are and will remain the exclusive property of Skill Force Cloud. Our content is protected by international copyright, trademark, and other laws.",
    },
    {
      id: "content",
      icon: Database,
      title: "Course Content & Access",
      content:
        "Upon enrollment, users are granted a limited license to access educational materials.",
      items: [
        "Course access is for personal, non-commercial use only.",
        "Sharing account access or redistributing course content is strictly prohibited.",
        "Skill Force Cloud reserves the right to modify or update course content without prior notice.",
      ],
    },
    {
      id: "liability",
      icon: AlertCircle,
      title: "Limitation of Liability",
      content:
        "Skill Force Cloud shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of the platform.",
      subItems: [
        "Loss of data or profits",
        "Business interruption",
        "Third-party service failures",
        "Inaccuracies in course materials",
      ],
    },
    {
      id: "changes",
      icon: FileText,
      title: "Governing Law",
      content:
        "These Terms shall be governed and construed in accordance with the laws of India, without regard to its conflict of law provisions.",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="pt-16 pb-12 px-6 relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-linear-to-b from-primary/5 to-transparent blur-3xl rounded-full -z-10" />

        {/* Title & intro */}
        <motion.div
          className="max-w-4xl mx-auto text-center"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
        >
          {/* Animated document icon */}
          <motion.div
            className="mb-8 inline-block p-4 rounded-full bg-primary/10 border border-primary/20 shadow-inner"
            animate={{ y: [0, -8, 0] }}
            transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
          >
            <FileText className="w-16 h-16 text-primary" />
          </motion.div>

          <h1 className="text-4xl md:text-6xl font-bold mb-6 tracking-tight">
            Terms & <span className="text-primary">Conditions</span>
          </h1>

          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed italic">
            "Transparency, security, and mutual respect are the foundation of our
            community guidelines."
          </p>
        </motion.div>
      </section>

      {/* Trust Banner */}
      <section className="max-w-4xl mx-auto px-6 mb-10">
        <div className="flex flex-row justify-between md:grid md:grid-cols-3 gap-3 md:gap-6">
          {[
            { label: "Community First", icon: Shield },
            { label: "Data Integrity", icon: Database },
            { label: "Fair Usage", icon: UserCheck },
          ].map((item, i) => (
            <motion.div
              key={item.label}
              className="p-3 md:p-6 rounded-xl md:rounded-2xl bg-card border border-border flex flex-col items-center gap-2 md:gap-3 text-center flex-1"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 + 0.3 }}
            >
              <item.icon className="w-6 h-6 md:w-8 md:h-8 text-primary" />
              <span className="hidden md:block font-semibold text-sm">
                {item.label}
              </span>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Terms Sections */}
      <main className="max-w-4xl mx-auto px-6 relative">
        <div className="space-y-4">
          {sections.map(section => (
            <motion.div
              key={section.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              {/* Section Card */}
              <div
                className={`p-6 md:p-8 rounded-[22px] bg-card border cursor-pointer transition-all
                  ${
                    activeSection === section.id
                      ? "border-foreground/40"
                      : "border-border/40 hover:border-foreground/20"
                  }`}
                onClick={() =>
                  setActiveSection(
                    activeSection === section.id ? null : section.id
                  )
                }
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-5">
                    <section.icon className="w-6 h-6 text-primary" />
                    <h3
                      className={`text-2xl font-bold ${
                        activeSection === section.id ? "text-primary" : ""
                      }`}
                    >
                      {section.title}
                    </h3>
                  </div>

                  {/* Chevron animation */}
                  <motion.div
                    animate={{
                      rotate: activeSection === section.id ? 90 : 0,
                    }}
                    transition={{ duration: 0.3 }}
                  >
                    <ChevronRight className="w-6 h-6 text-muted-foreground" />
                  </motion.div>
                </div>

                {/* Expandable content */}
                <AnimatePresence>
                  {activeSection === section.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="pt-6 space-y-4">
                        <p className="text-muted-foreground text-sm md:text-base leading-relaxed">
                          {section.content}
                        </p>

                        {/* Bullet items */}
                        {section.items && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                            {section.items.map((item, i) => (
                              <motion.div
                                key={i}
                                className="flex items-center gap-3 p-3 rounded-xl bg-accent/20 border"
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: i * 0.05 }}
                              >
                                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                                <span className="text-sm font-medium">
                                  {item}
                                </span>
                              </motion.div>
                            ))}
                          </div>
                        )}

                        {/* Liability sub-items */}
                        {section.subItems && (
                          <div className="mt-4 p-4 rounded-xl bg-background/50 border">
                            <p className="text-sm font-semibold mb-3">
                              Including, but not limited to:
                            </p>
                            <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {section.subItems.map((item, i) => (
                                <li
                                  key={i}
                                  className="flex items-center gap-2 text-muted-foreground text-xs italic"
                                >
                                  <span className="w-1 h-1 rounded-full bg-primary" />
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Contact Footer */}
        <motion.div
          className="mt-12 p-8 md:p-12 rounded-[28px] bg-card border border-primary text-center space-y-8"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <div className="space-y-4">
            <h3 className="text-3xl font-bold text-primary">Questions?</h3>
            <p className="text-muted-foreground">
              If you have any questions about these Terms, our team is here to
              help you.
            </p>
          </div>

          {/* Contact actions */}
          <div className="flex flex-wrap justify-center gap-6">
            <a
              href="mailto:support@skillforcecloud.com"
              className="flex items-center gap-3 px-6 py-3 rounded-2xl border hover:border-primary"
            >
              <Mail className="w-5 h-5 text-primary" />
              <span className="font-semibold text-sm">
                support@skillforcecloud.com
              </span>
            </a>

            <a
              href="tel:+919071371117"
              className="flex items-center gap-3 px-6 py-3 rounded-2xl border hover:border-primary"
            >
              <Phone className="w-5 h-5 text-primary" />
              <span className="font-semibold text-sm">+91 90713 71117</span>
            </a>
          </div>

          {/* Address */}
          <div className="pt-8 border-t border-border/20 space-y-2">
            <div className="flex items-center justify-center gap-2 text-primary">
              <LocateFixed className="w-5 h-5" />
              <span className="font-bold uppercase text-xs tracking-widest">
                Headquarters
              </span>
            </div>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto">
              952, 27th A Main Rd, Jayanagara 9th Block, Jayanagar, Bengaluru,
              Karnataka 560041
            </p>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
