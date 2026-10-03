import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  Building2,
  CalendarCheck,
  CalendarDays,
  ChartColumn,
  Check,
  ClipboardList,
  FileClock,
  Globe,
  HeartPulse,
  KeyRound,
  Lock,
  Package,
  Receipt,
  ShieldCheck,
  Smile,
  Sparkles,
  Stethoscope,
  UserCheck,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/logo";
import {
  AestheticMock,
  AssistantBubble,
  AssistantMock,
  BookingToast,
  DentalMock,
  HeroMockup,
  MedicalMock,
} from "./product-mockups";

/* -------------------------------------------------------------------------- */
/* Shared bits                                                                 */
/* -------------------------------------------------------------------------- */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="text-primary mb-3 text-sm font-semibold tracking-wide">{children}</div>;
}

function SectionHeading({
  eyebrow,
  title,
  description,
  className,
}: {
  eyebrow: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto max-w-2xl text-center", className)}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {description && (
        <p className="text-muted-foreground mt-4 text-base text-pretty sm:text-lg">{description}</p>
      )}
    </div>
  );
}

function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item} className="flex gap-3 text-[15px]">
          <span className="bg-tint-primary text-tint-primary-foreground mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full">
            <Check className="size-3" strokeWidth={3} />
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* Hero                                                                        */
/* -------------------------------------------------------------------------- */

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* One soft accent glow behind the headline; the rest of the page stays flat. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 -z-10 mx-auto h-[640px] max-w-5xl bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--primary)_18%,transparent),transparent)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-20 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [mask-image:linear-gradient(to_bottom,black,transparent_70%)] bg-[size:56px_56px] opacity-60"
      />

      <div className="mx-auto max-w-6xl px-4 pt-16 pb-10 sm:px-6 sm:pt-24">
        <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 mx-auto max-w-3xl text-center duration-700">
          <div className="bg-card ring-border/70 shadow-liquid mx-auto mb-6 flex w-fit items-center gap-2 rounded-full py-1 pr-3.5 pl-1 text-xs ring-1 sm:text-sm">
            <span className="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-[11px] font-semibold">
              New
            </span>
            <span className="text-muted-foreground">Interactive dental charting is here</span>
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl sm:leading-[1.05]">
            The operating system for{" "}
            <span className="from-primary bg-gradient-to-r to-[oklch(0.55_0.17_300)] bg-clip-text text-transparent">
              modern clinics
            </span>
          </h1>
          <p className="text-muted-foreground mx-auto mt-6 max-w-2xl text-base text-pretty sm:text-lg">
            Scheduling, online booking, patient records, dental charting, billing, inventory and an
            AI assistant — in one calm workspace built for dental, medical and aesthetic clinics,
            from a single branch to ten.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild className="h-11 w-full px-6 text-[15px] sm:w-auto">
              <Link href="/signup">
                Create your clinic
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-11 w-full px-6 text-[15px] sm:w-auto">
              <a href="#how-it-works">See how it works</a>
            </Button>
          </div>
          <p className="text-muted-foreground mt-4 text-xs">
            Set up your first clinic in minutes. Works in any browser — desktop, tablet or phone.
          </p>
        </div>

        <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-6 relative mx-auto mt-14 max-w-5xl duration-1000 sm:mt-20">
          <HeroMockup />
          <BookingToast className="absolute -bottom-8 -left-6 hidden md:flex lg:-left-12" />
          <AssistantBubble className="absolute -top-24 -right-4 hidden md:block lg:-right-14" />
        </div>
      </div>
    </section>
  );
}

export function AudienceStrip() {
  const items = [
    { icon: Smile, label: "Dental clinics" },
    { icon: Stethoscope, label: "Medical practices" },
    { icon: Sparkles, label: "Aesthetic & skin clinics" },
    { icon: Building2, label: "Multi-branch groups" },
  ];
  return (
    <section aria-label="Who CareFlow is for" className="mx-auto max-w-6xl px-4 pt-14 pb-4 sm:px-6">
      <p className="text-muted-foreground text-center text-sm">
        One platform, shaped around the way your specialty actually works
      </p>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map(({ icon: Icon, label }) => (
          <div
            key={label}
            className="text-muted-foreground flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium"
          >
            <Icon className="text-primary size-4" />
            {label}
          </div>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Specialties                                                                 */
/* -------------------------------------------------------------------------- */

const SPECIALTIES = [
  {
    value: "dental",
    icon: Smile,
    label: "Dental",
    title: "A real dental chart — not a notes field",
    body: "Chart findings tooth by tooth and surface by surface, plan treatment, and see every tooth's full history at a glance. It only appears for clinics set up as dental.",
    points: [
      "Interactive odontogram with FDI or Universal numbering",
      "Findings on mesial, distal, buccal, lingual, occlusal and incisal surfaces",
      "Treatment plans that move from planned to scheduled to completed",
      "Open the chart straight from today's appointment",
      "Nothing is overwritten — corrections stay visible in the history",
    ],
    mock: DentalMock,
  },
  {
    value: "medical",
    icon: Stethoscope,
    label: "Medical",
    title: "Keep consultations and follow-ups moving",
    body: "Give doctors a clean schedule and give the front desk one place to see every patient's visits, follow-ups, invoices and payments.",
    points: [
      "Per-doctor calendars that can't be double-booked",
      "Follow-ups with due dates, so no patient falls through the cracks",
      "Automatic appointment reminders before every visit",
      "Complete visit, invoice and payment history on each patient",
      "Invoices and payments recorded right at checkout",
    ],
    mock: MedicalMock,
  },
  {
    value: "aesthetic",
    icon: Sparkles,
    label: "Aesthetic",
    title: "Know your treatments, your stock and your margins",
    body: "Link products to the treatments that use them, and CareFlow keeps stock, expiry dates and revenue per service in step with your day.",
    points: [
      "Service menu with duration and price for every branch",
      "Products used per treatment deducted from stock automatically",
      "Expiry and low-stock tracking for injectables and consumables",
      "Your own branded online booking page",
      "Revenue by service, practitioner and branch",
    ],
    mock: AestheticMock,
  },
] as const;

export function Specialties() {
  return (
    <section id="specialties" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Built for your specialty"
          title="Choose your clinic type. CareFlow adapts."
          description="Tell us what kind of clinic you run when you sign up. Each branch gets the tools its specialty needs — and none of the clutter it doesn't."
        />

        <Tabs defaultValue="dental" className="mt-12 items-center gap-10">
          <TabsList className="bg-card ring-border/70 shadow-liquid h-auto rounded-full p-1 ring-1 group-data-horizontal/tabs:h-auto">
            {SPECIALTIES.map(({ value, icon: Icon, label }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground h-9 gap-2 rounded-full px-4 text-sm sm:px-5"
              >
                <Icon className="size-4" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          {SPECIALTIES.map(({ value, title, body, points, mock: Mock }) => (
            <TabsContent key={value} value={value} className="w-full">
              <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.15fr] lg:gap-14">
                <div>
                  <h3 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
                    {title}
                  </h3>
                  <p className="text-muted-foreground mt-4 text-pretty">{body}</p>
                  <div className="mt-6">
                    <CheckList items={[...points]} />
                  </div>
                </div>
                <Mock />
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Features                                                                    */
/* -------------------------------------------------------------------------- */

const FEATURES = [
  {
    icon: CalendarDays,
    title: "Scheduling without collisions",
    body: "Day and week calendars by practitioner. A double booking isn't just flagged — the system refuses it.",
    span: "lg:col-span-2",
    accent: true,
    visual: "schedule",
  },
  {
    icon: Globe,
    title: "Online booking page",
    body: "A clean booking page with your logo. Patients pick a service, practitioner and time; your team is notified instantly.",
  },
  {
    icon: BellRing,
    title: "Reminders & follow-ups",
    body: "Automatic reminders before visits and follow-up tasks after them, so fewer patients slip away.",
  },
  {
    icon: Receipt,
    title: "Invoicing & payments",
    body: "Invoices with discounts and tax, partial payments, refunds and outstanding balances — cash, card, bank transfer or e-wallet.",
  },
  {
    icon: Package,
    title: "Inventory & suppliers",
    body: "Stock per branch, purchase orders, batch expiry, and automatic deduction when a service is completed.",
  },
  {
    icon: ChartColumn,
    title: "Dashboards & reports",
    body: "Revenue, appointments, no-shows and branch comparisons, filterable by date, clinic, service and practitioner. Export to CSV.",
    span: "lg:col-span-2",
    visual: "report",
  },
  {
    icon: Building2,
    title: "Every branch, one login",
    body: "Run several clinics under one organization — each with its own type, hours, services and team.",
  },
] as const;

/** Decorative: a booked slot, and a second booking for the same slot refused. */
function ScheduleVisual() {
  return (
    <div aria-hidden className="mt-6 w-full space-y-2 text-xs sm:mt-0 sm:w-60">
      <div className="bg-tint-success text-tint-success-foreground border-l-tint-success-foreground rounded-lg border-l-2 px-3 py-2">
        <div className="font-medium">10:00 · Check-up</div>
        <div className="opacity-80">Dr. Ana Reyes · Bea Santos</div>
      </div>
      <div className="border-tint-destructive-foreground/50 text-tint-destructive-foreground flex items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2">
        <div>
          <div className="font-medium">10:00 · Dr. Ana Reyes</div>
          <div className="opacity-80">Already booked — pick another time</div>
        </div>
        <span className="bg-tint-destructive flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold">
          ✕
        </span>
      </div>
    </div>
  );
}

/** Decorative: a small weekly revenue column sketch (not data). */
function ReportVisual() {
  const bars = [42, 58, 50, 66, 61, 78, 92];
  return (
    <div aria-hidden className="mt-6 w-full sm:mt-0 sm:w-60">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">Revenue · this week</span>
        <span className="text-tint-success-foreground font-medium">+18%</span>
      </div>
      <div className="mt-3 flex h-24 items-end gap-1.5 border-b">
        {bars.map((h, i) => (
          <span
            key={i}
            style={{ height: `${h}%` }}
            className={cn(
              "flex-1 rounded-t-[4px]",
              i === bars.length - 1 ? "bg-primary" : "bg-tint-primary",
            )}
          />
        ))}
      </div>
      <div className="text-muted-foreground mt-1.5 flex justify-between text-[10px]">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i} className="flex-1 text-center">
            {d}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Features() {
  return (
    <section id="features" className="bg-card/60 scroll-mt-20 border-y py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Everything in one place"
          title="Replace the spreadsheets, the paper logbook and the group chat"
          description="Every part of running the clinic shares the same patients, appointments and records — so nothing has to be typed twice."
        />
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            const span = "span" in f ? f.span : undefined;
            const accent = "accent" in f && f.accent;
            const visual = "visual" in f ? f.visual : undefined;
            return (
              <div
                key={f.title}
                className={cn(
                  "bg-card ring-border/70 shadow-liquid group hover:shadow-liquid-lg relative overflow-hidden rounded-2xl p-6 ring-1 transition-shadow",
                  span,
                  visual && "sm:grid sm:grid-cols-[1fr_auto] sm:items-center sm:gap-8",
                )}
              >
                <div>
                  <span
                    className={cn(
                      "mb-5 flex size-10 items-center justify-center rounded-xl",
                      accent
                        ? "bg-primary text-primary-foreground"
                        : "bg-tint-primary text-tint-primary-foreground",
                    )}
                  >
                    <Icon className="size-5" />
                  </span>
                  <h3 className="text-lg font-semibold tracking-tight">{f.title}</h3>
                  <p className="text-muted-foreground mt-2 text-[15px] text-pretty">{f.body}</p>
                </div>
                {visual === "schedule" && <ScheduleVisual />}
                {visual === "report" && <ReportVisual />}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* AI assistant                                                                */
/* -------------------------------------------------------------------------- */

export function Assistant() {
  const points = [
    {
      icon: ChartColumn,
      title: "Answers from your live data",
      body: "Ask about today's schedule, unpaid invoices, overdue follow-ups, low stock or last month's revenue — in plain language.",
    },
    {
      icon: KeyRound,
      title: "Sees only what you can see",
      body: "The assistant uses your permissions. A receptionist's assistant never shows the finance report.",
    },
    {
      icon: UserCheck,
      title: "Asks before it acts",
      body: "Booking an appointment or recording a payment always shows you the details first and waits for your confirmation.",
    },
    {
      icon: HeartPulse,
      title: "Never plays doctor",
      body: "It retrieves and summarises your records. Diagnosis and treatment decisions stay with your clinicians.",
    },
  ];
  return (
    <section id="assistant" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
        <div className="order-2 lg:order-1">
          <AssistantMock />
        </div>
        <div className="order-1 lg:order-2">
          <Eyebrow>AI assistant</Eyebrow>
          <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            An assistant that knows your clinic — and its limits
          </h2>
          <p className="text-muted-foreground mt-4 text-base text-pretty sm:text-lg">
            Ask a question the way you&apos;d ask your clinic manager. CareFlow answers from your
            real records, and can take simple actions for you once you say yes.
          </p>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            {points.map(({ icon: Icon, title, body }) => (
              <div key={title}>
                <Icon className="text-primary size-5" />
                <h3 className="mt-3 font-semibold">{title}</h3>
                <p className="text-muted-foreground mt-1 text-sm text-pretty">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* How it works                                                                */
/* -------------------------------------------------------------------------- */

export function HowItWorks() {
  const steps = [
    {
      icon: Globe,
      title: "Patient books online",
      body: "From your booking page, any time of day.",
    },
    { icon: BellRing, title: "Reminder goes out", body: "Automatically, before the visit." },
    {
      icon: ClipboardList,
      title: "Visit is recorded",
      body: "Charted, completed, supplies deducted.",
    },
    {
      icon: Wallet,
      title: "Invoice is settled",
      body: "Paid in full or in parts, with a receipt.",
    },
    { icon: ChartColumn, title: "Reports update", body: "Revenue and performance, live." },
  ];
  return (
    <section id="how-it-works" className="bg-card/60 scroll-mt-20 border-y py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="How it works"
          title="One flow, from booking to the books"
          description="Each step hands off to the next on its own, so your team spends the day with patients instead of chasing paperwork."
        />
        <ol className="relative mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-5 lg:gap-4">
          <div
            aria-hidden
            className="from-primary/0 via-primary/40 to-primary/0 absolute top-6 right-[10%] left-[10%] hidden h-px bg-gradient-to-r lg:block"
          />
          {steps.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="relative flex flex-col items-center text-center">
              <span className="bg-card ring-border/70 shadow-liquid text-primary relative flex size-12 items-center justify-center rounded-2xl ring-1">
                <Icon className="size-5" />
                <span className="bg-primary text-primary-foreground absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full text-[10px] font-semibold">
                  {i + 1}
                </span>
              </span>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="text-muted-foreground mt-1 max-w-[16rem] text-sm">{body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Security                                                                    */
/* -------------------------------------------------------------------------- */

export function Security() {
  const items = [
    {
      icon: Lock,
      title: "Isolated by design",
      body: "Every clinic's data is walled off at the database itself, not just hidden in the app.",
    },
    {
      icon: KeyRound,
      title: "Role-based access",
      body: "Owners, doctors, receptionists, finance and inventory staff each see only what their job needs — per branch.",
    },
    {
      icon: FileClock,
      title: "Complete audit trail",
      body: "Who changed what, and when, is recorded automatically for sensitive actions.",
    },
    {
      icon: ShieldCheck,
      title: "Records you can trust",
      body: "Clinical and financial records are never silently deleted. Corrections are logged and remain visible.",
    },
  ];
  return (
    <section id="security" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="bg-foreground text-background relative overflow-hidden rounded-3xl px-6 py-14 sm:px-12 sm:py-16">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-32 -right-32 size-96 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--primary)_45%,transparent),transparent)]"
          />
          <div className="relative grid gap-12 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
            <div>
              <div className="mb-3 text-sm font-semibold tracking-wide text-[oklch(0.78_0.12_264)]">
                Security & privacy
              </div>
              <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                Patient data, locked down from the ground up
              </h2>
              <p className="mt-4 text-pretty opacity-70">
                Your patients trust you with their health. CareFlow is built so that trust is
                enforced by the system, not left to good intentions.
              </p>
            </div>
            <div className="grid gap-x-8 gap-y-8 sm:grid-cols-2">
              {items.map(({ icon: Icon, title, body }) => (
                <div key={title}>
                  <span className="flex size-10 items-center justify-center rounded-xl bg-white/10">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="mt-4 font-semibold">{title}</h3>
                  <p className="mt-1 text-sm text-pretty opacity-70">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* FAQ                                                                         */
/* -------------------------------------------------------------------------- */

const FAQS = [
  {
    q: "What kinds of clinics is CareFlow for?",
    a: "Dental clinics, medical practices and aesthetic or skin clinics are our focus. Therapy, rehabilitation and wellness clinics can use CareFlow too — you choose your clinic type when you sign up, and each branch can have its own.",
  },
  {
    q: "Can I manage more than one branch?",
    a: "Yes. One organization can run many clinics, each with its own hours, services, team and type. Dashboards let you compare branches or look at one at a time, and staff access can be limited to specific branches.",
  },
  {
    q: "Is the dental chart available to every clinic?",
    a: "It appears only for clinics set up as dental, and only for staff with clinical access. A group running both a dental and an aesthetic branch sees the chart on its dental patients only.",
  },
  {
    q: "Does the AI assistant make clinical decisions?",
    a: "No. It answers operational questions from your records — schedules, payments, follow-ups, stock — and can book or record things only after you confirm. It never diagnoses or recommends treatment.",
  },
  {
    q: "Can patients book appointments themselves?",
    a: "Yes. Each clinic can publish its own booking page with its logo. Patients choose a service, practitioner and an open time, and can cancel or reschedule from their confirmation link. Your team gets notified of every new booking.",
  },
  {
    q: "Do I need to install anything?",
    a: "No. CareFlow runs in the browser on desktop, tablet and phone. Create your account, choose your clinic type, add your services and invite your team.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="bg-card/60 scroll-mt-20 border-y py-20 sm:py-28">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
        <div>
          <Eyebrow>FAQ</Eyebrow>
          <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Questions, answered
          </h2>
          <p className="text-muted-foreground mt-4 text-pretty">
            Still deciding? Create an account and look around — setting up your first clinic takes a
            few minutes.
          </p>
        </div>
        <div className="bg-card divide-y rounded-2xl border px-5 sm:px-6">
          {FAQS.map(({ q, a }) => (
            <details key={q} className="group py-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                {q}
                <span className="bg-muted text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-base leading-none transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="text-muted-foreground mt-3 pr-8 text-[15px] text-pretty">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Closing CTA + footer                                                        */
/* -------------------------------------------------------------------------- */

export function FinalCta() {
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
        <span className="bg-tint-primary text-tint-primary-foreground mx-auto flex size-12 items-center justify-center rounded-2xl">
          <CalendarCheck className="size-6" />
        </span>
        <h2 className="mt-6 text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
          Give your front desk its mornings back
        </h2>
        <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-base text-pretty sm:text-lg">
          Set up your clinic, add your services and team, and take your first online booking today.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild className="h-11 w-full px-6 text-[15px] sm:w-auto">
            <Link href="/signup">
              Create your clinic
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="ghost" className="h-11 w-full px-6 text-[15px] sm:w-auto">
            <Link href="/login">I already have an account</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

export function SiteFooter() {
  const columns = [
    {
      title: "Product",
      links: [
        { href: "#specialties", label: "Specialties" },
        { href: "#features", label: "Features" },
        { href: "#assistant", label: "AI assistant" },
        { href: "#security", label: "Security" },
      ],
    },
    {
      title: "Clinics",
      links: [
        { href: "#specialties", label: "Dental" },
        { href: "#specialties", label: "Medical" },
        { href: "#specialties", label: "Aesthetic" },
      ],
    },
    {
      title: "Account",
      links: [
        { href: "/login", label: "Sign in" },
        { href: "/signup", label: "Create account" },
      ],
    },
  ];
  return (
    <footer className="border-t">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.5fr_repeat(3,1fr)]">
        <div>
          <Logo href="/" />
          <p className="text-muted-foreground mt-4 max-w-xs text-sm">
            AI-assisted practice management for dental, medical and aesthetic clinics.
          </p>
        </div>
        {columns.map((col) => (
          <div key={col.title}>
            <div className="text-sm font-semibold">{col.title}</div>
            <ul className="mt-4 space-y-2.5">
              {col.links.map((l) => (
                <li key={l.label}>
                  {l.href.startsWith("/") ? (
                    <Link
                      href={l.href}
                      className="text-muted-foreground hover:text-foreground text-sm"
                    >
                      {l.label}
                    </Link>
                  ) : (
                    <a
                      href={l.href}
                      className="text-muted-foreground hover:text-foreground text-sm"
                    >
                      {l.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="text-muted-foreground mx-auto max-w-6xl border-t px-4 py-6 text-xs sm:px-6">
        © {new Date().getFullYear()} CareFlow AI. All rights reserved.
      </div>
    </footer>
  );
}
