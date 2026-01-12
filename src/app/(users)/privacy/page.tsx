"use client";
import { useState } from "react";
import {
  Shield,
  Eye,
  Lock,
  Database,
  UserCheck,
  ChevronRight,
  Mail,
  LocateFixed,
  Phone,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export default function PrivacyPage() {
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const sections = [
    {
      id: "collection",
      icon: Eye,
      title: "Data Collection",
      content:
        "We collect personal information that you voluntarily provide to us when you register on the platform, express an interest in obtaining information about us or our products and services.",
      items: [
        "Account Credentials (Email, Name, Password)",
        "Profile Information (Professional background, Skills)",
        "Educational Progress & Certifications",
        "Payment Transaction Details",
      ],
    },
    {
      id: "usage",
      icon: Database,
      title: "How We Use Data",
      content: "Your data helps us provide a personalized learning experience and maintain platform security.",
      items: [
        "To facilitate account creation and logon process.",
        "To send administrative information and updates.",
        "To manage user orders and progress tracking.",
        "To protect our users and maintain site integrity.",
      ],
    },
    {
      id: "protection",
      icon: Lock,
      title: "Data Protection",
      content:
        "We implement a variety of security measures to maintain the safety of your personal information when you enter, submit, or access your data.",
      items: [
        "Encryption of sensitive data at rest and in transit.",
        "Regular security audits and vulnerability assessments.",
        "Strict access controls for internal staff.",
      ],
    },
    {
      id: "rights",
      icon: UserCheck,
      title: "Your Privacy Rights",
      content: "Depending on your location, you have specific rights regarding your personal information.",
      items: [
        "Right to access your personal data.",
        "Right to correct inaccurate information.",
        "Right to request deletion (Erasure).",
        "Right to object to data processing.",
      ],
    },
    {
      id: "cookies",
      icon: Database,
      title: "Cookie Policy",
      content:
        "Our platform uses cookies to enhance user experience and analyze traffic. You can control cookie settings through your browser.",
    },
  ];

  return (
    <div className="min-h-screen bg-background ">
      {/* Hero Section */}
      <section className="pt-16 pb-12 px-6 relative overflow-hidden">
        <div className="absolute top-0 right-1/2 translate-x-1/2 w-full h-full bg-primary/5 blur-3xl rounded-full -z-10" />
        <motion.div
          className="max-w-4xl mx-auto text-center"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
        >
          <motion.div
            className="mb-8 inline-block p-4 rounded-full bg-primary/10 border border-primary/20 shadow-inner"
            animate={{ 
              y: [0, -8, 0],
            }}
            transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
          >
            <Shield className="w-16 h-16 text-primary" />
          </motion.div>
          <h1 className="text-4xl md:text-6xl font-bold mb-6 tracking-tight">
            Privacy <span className="text-primary">Policy</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed italic">
            "Your trust is our most valuable asset. We are committed to protecting your personal data with the highest standards of security."
          </p>
        </motion.div>
      </section>

      {/* Trust Banner */}
      <section className="max-w-4xl mx-auto px-6 mb-10">
        <div className="flex flex-row justify-between md:grid md:grid-cols-3 gap-3 md:gap-6">
          {[
            { label: "Secure Storage", icon: Lock },
            { label: "Transparent Use", icon: Eye },
            { label: "User Control", icon: UserCheck },
          ].map((item, i) => (
            <motion.div
              key={item.label}
              className="p-3 md:p-6 rounded-xl md:rounded-2xl bg-card border border-border flex flex-col items-center gap-2 md:gap-3 text-center flex-1 md:flex-initial"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 + 0.3 }}
            >
              <item.icon className="w-6 h-6 md:w-8 md:h-8 text-primary" />
              <span className="hidden md:block font-semibold text-sm">{item.label}</span>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Policy Sections */}
      <main className="max-w-4xl mx-auto px-6 relative">
       
        <div className="space-y-4">
          {sections.map((section, idx) => (
            <motion.div
              key={section.id}
              className="relative z-10"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
              <div 
                className={`p-6 md:p-8 rounded-[22px] bg-card border transition-all duration-300 cursor-pointer group
                  ${activeSection === section.id ? 'border-foreground/40' : 'border-border/40 hover:border-foreground/20'}`}
                onClick={() => setActiveSection(activeSection === section.id ? null : section.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-5">
                    <div className="w-6 h-6 flex items-center justify-center text-primary transition-all duration-300">
                      <section.icon className="w-6 h-6" />
                    </div>
                    <h3 className={`text-2xl font-bold transition-colors duration-300 ${activeSection === section.id ? 'text-primary' : ''}`}>
                      {section.title}
                    </h3>
                  </div>
                  <motion.div
                    animate={{ rotate: activeSection === section.id ? 90 : 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <ChevronRight className="w-6 h-6 text-muted-foreground" />
                  </motion.div>
                </div>

                <AnimatePresence>
                  {activeSection === section.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="pt-6 space-y-4">
                        <p className="text-muted-foreground leading-relaxed text-sm md:text-base">
                          {section.content}
                        </p>
                        {section.items && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                            {section.items.map((item, i) => (
                              <motion.div
                                key={i}
                                className="flex items-center gap-3 p-3 rounded-xl bg-accent/20 border border-border/10"
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: i * 0.05 }}
                              >
                                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                                <span className="text-sm font-medium">{item}</span>
                              </motion.div>
                            ))}
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
          className="mt-12 p-8 md:p-12 rounded-[28px] bg-card border border-primary text-center space-y-8 overflow-hidden relative"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <div className="max-w-2xl mx-auto space-y-4">
            <h3 className="text-3xl font-bold text-primary">Privacy Concerns?</h3>
            <p className="text-muted-foreground">
              We're here to answer any questions you have about your data. Contact our Data Protection Officer for detailed inquiries.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-6">
            <a href="mailto:privacy@skillforcecloud.com" className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-card border border-border hover:border-primary transition-all group">
              <Mail className="w-5 h-5 text-primary group-hover:scale-110 transition-transform" />
              <span className="font-semibold text-sm">privacy@skillforcecloud.com</span>
            </a>
            <a href="tel:+919071371117" className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-card border border-border hover:border-primary transition-all group">
              <Phone className="w-5 h-5 text-primary group-hover:scale-110 transition-transform" />
              <span className="font-semibold text-sm">+91 90713 71117</span>
            </a>
          </div>

          <div className="pt-8 border-t border-border/20 flex flex-col items-center gap-4">
            <div className="flex items-center gap-2 text-primary">
              <LocateFixed className="w-5 h-5" />
              <span className="font-bold tracking-widest uppercase text-xs">Headquarters</span>
            </div>
            <p className="text-muted-foreground text-sm max-w-sm">
              952, 27th A Main Rd, Jayanagara 9th Block, Jayanagar, Bengaluru, Karnataka 560041
            </p>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
