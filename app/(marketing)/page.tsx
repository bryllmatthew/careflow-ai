import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/session";
import {
  Assistant,
  AudienceStrip,
  Faq,
  Features,
  FinalCta,
  Hero,
  HowItWorks,
  Security,
  Specialties,
} from "@/components/marketing/sections";

export const metadata: Metadata = {
  title: { absolute: "CareFlow AI — Clinic management for dental, medical & aesthetic clinics" },
  description:
    "Scheduling, online booking, patient records, dental charting, billing, inventory and an AI assistant in one workspace for dental, medical and aesthetic clinics.",
  openGraph: {
    title: "CareFlow AI — The operating system for modern clinics",
    description:
      "Scheduling, online booking, dental charting, billing, inventory and an AI assistant for dental, medical and aesthetic clinics.",
    type: "website",
  },
};

/**
 * Signed-out visitors get the landing page. Signed-in users are sent on to
 * the right place, exactly as before: a user with memberships but none active
 * (every one suspended or removed) goes to /no-access rather than seeing
 * /create-organization's "create your organization" copy.
 */
export default async function Home() {
  const auth = await getAuthContext();

  if (auth) {
    if (auth.memberships.length === 0) {
      redirect(auth.hasAnyMembership ? "/no-access" : "/create-organization");
    }
    redirect("/dashboard");
  }

  return (
    <>
      <Hero />
      <AudienceStrip />
      <Specialties />
      <Features />
      <Assistant />
      <HowItWorks />
      <Security />
      <Faq />
      <FinalCta />
    </>
  );
}
