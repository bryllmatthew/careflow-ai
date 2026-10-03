/**
 * Coded illustrations of the product for the landing page. They are drawn
 * with the app's own tokens rather than screenshots, so they stay sharp at any
 * size, follow the theme, and never go stale against a real tenant's data.
 * All names and figures are illustrative.
 */
import {
  BellRing,
  CalendarDays,
  Check,
  LayoutDashboard,
  Package,
  Receipt,
  Sparkles,
  Stethoscope,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Hero: the day schedule                                                      */
/* -------------------------------------------------------------------------- */

const SLOTS = ["9:00", "9:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30"];

type Block = {
  start: number; // slot index
  span: number;
  title: string;
  who: string;
  tone: "primary" | "success" | "info" | "warning";
  tag?: string;
};

const COLUMNS: { name: string; role: string; blocks: Block[] }[] = [
  {
    name: "Dr. Ana Reyes",
    role: "Dentist",
    blocks: [
      { start: 0, span: 2, title: "Composite restoration", who: "Juan Dela Cruz", tone: "primary" },
      { start: 3, span: 1, title: "Check-up", who: "Bea Santos", tone: "success" },
      { start: 5, span: 2, title: "Root canal", who: "Carlo Tan", tone: "info" },
    ],
  },
  {
    name: "Dr. Paolo Lim",
    role: "Physician",
    blocks: [
      { start: 1, span: 1, title: "Consultation", who: "Liza Gomez", tone: "info" },
      { start: 2, span: 1, title: "BP follow-up", who: "Ramon Cruz", tone: "success" },
      {
        start: 4,
        span: 1,
        title: "Consultation",
        who: "Maria Lopez",
        tone: "warning",
        tag: "New",
      },
      { start: 6, span: 2, title: "Annual physical", who: "Joy Villar", tone: "primary" },
    ],
  },
  {
    name: "Mika Santos",
    role: "Aesthetician",
    blocks: [
      { start: 0, span: 1, title: "HydraFacial", who: "Nina Reyes", tone: "success" },
      { start: 2, span: 2, title: "Botox — forehead", who: "Grace Uy", tone: "primary" },
      { start: 5, span: 1, title: "Chemical peel", who: "Ella Cruz", tone: "info" },
    ],
  },
];

const BLOCK_TONE: Record<Block["tone"], string> = {
  primary: "bg-tint-primary text-tint-primary-foreground border-l-tint-primary-foreground",
  success: "bg-tint-success text-tint-success-foreground border-l-tint-success-foreground",
  info: "bg-tint-info text-tint-info-foreground border-l-tint-info-foreground",
  warning: "bg-tint-warning text-tint-warning-foreground border-l-tint-warning-foreground",
};

const SIDEBAR = [
  { icon: LayoutDashboard, label: "Dashboard" },
  { icon: CalendarDays, label: "Calendar", active: true },
  { icon: Users, label: "Patients" },
  { icon: Receipt, label: "Invoices" },
  { icon: Package, label: "Inventory" },
  { icon: Sparkles, label: "Assistant" },
];

function WindowChrome({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card ring-border/70 shadow-liquid-lg overflow-hidden rounded-2xl ring-1">
      <div className="bg-muted/60 flex items-center gap-3 border-b px-4 py-2.5">
        <div className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-[oklch(0.75_0.15_27)]" />
          <span className="size-2.5 rounded-full bg-[oklch(0.82_0.14_85)]" />
          <span className="size-2.5 rounded-full bg-[oklch(0.75_0.14_152)]" />
        </div>
        <div className="text-muted-foreground bg-card mx-auto rounded-md px-3 py-0.5 text-[11px]">
          {title}
        </div>
        <div className="w-10" aria-hidden />
      </div>
      {children}
    </div>
  );
}

export function HeroMockup() {
  return (
    <WindowChrome title="Calendar · Davao Branch">
      <div className="flex">
        <aside className="hidden w-44 shrink-0 flex-col gap-0.5 border-r p-3 lg:flex">
          {SIDEBAR.map(({ icon: Icon, label, active }) => (
            <div
              key={label}
              className={cn(
                "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-muted-foreground",
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </div>
          ))}
        </aside>

        <div className="min-w-0 flex-1 p-4 sm:p-5">
          <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
            {[
              { label: "Appointments today", value: "18", delta: "+3 vs last Thu" },
              { label: "Collected this week", value: "₱86,400", delta: "+12%" },
              { label: "New online bookings", value: "5", delta: "2 to confirm" },
            ].map((s) => (
              <div key={s.label} className="bg-background/60 rounded-xl border p-2.5 sm:p-3">
                <div className="text-muted-foreground truncate text-[10px] sm:text-[11px]">
                  {s.label}
                </div>
                <div className="mt-0.5 text-sm font-semibold tracking-tight sm:text-lg">
                  {s.value}
                </div>
                <div className="text-tint-success-foreground hidden text-[10px] sm:block">
                  {s.delta}
                </div>
              </div>
            ))}
          </div>

          <div className="flex text-[10px] sm:text-[11px]">
            <div className="w-9 shrink-0 sm:w-11" aria-hidden>
              <div className="h-9" />
              {SLOTS.map((t) => (
                <div key={t} className="text-muted-foreground h-9 -translate-y-1.5 sm:h-10">
                  {t}
                </div>
              ))}
            </div>
            <div className="grid min-w-0 flex-1 grid-cols-3 gap-1.5 sm:gap-2">
              {COLUMNS.map((col) => (
                <div key={col.name} className="min-w-0">
                  <div className="h-9 truncate">
                    <div className="truncate font-medium">{col.name}</div>
                    <div className="text-muted-foreground truncate">{col.role}</div>
                  </div>
                  <div className="relative grid grid-rows-[repeat(8,2.25rem)] border-t sm:grid-rows-[repeat(8,2.5rem)]">
                    {SLOTS.map((t, i) => (
                      <div
                        key={t}
                        className="border-b border-dashed"
                        style={{ gridRow: i + 1, gridColumn: 1 }}
                        aria-hidden
                      />
                    ))}
                    {col.blocks.map((b) => (
                      <div
                        key={b.title + b.start}
                        style={{ gridRow: `${b.start + 1} / span ${b.span}`, gridColumn: 1 }}
                        className={cn(
                          "z-10 m-0.5 flex min-w-0 flex-col justify-center overflow-hidden rounded-md border-l-2 px-1.5 py-0.5 leading-tight",
                          BLOCK_TONE[b.tone],
                        )}
                      >
                        <div className="flex items-center gap-1">
                          <span className="truncate font-medium">{b.title}</span>
                          {b.tag && (
                            <span className="bg-primary text-primary-foreground shrink-0 rounded px-1 text-[9px] leading-tight">
                              {b.tag}
                            </span>
                          )}
                        </div>
                        <span className="truncate opacity-80">{b.who}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </WindowChrome>
  );
}

/** Floating card: a booking notification. */
export function BookingToast({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "bg-card/95 ring-border/70 shadow-liquid-lg flex w-64 items-start gap-3 rounded-2xl p-3.5 ring-1 backdrop-blur",
        className,
      )}
    >
      <span className="bg-tint-primary text-tint-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
        <BellRing className="size-4" />
      </span>
      <div className="min-w-0 text-xs">
        <div className="font-semibold">New online booking</div>
        <div className="text-muted-foreground mt-0.5">
          Maria Lopez · Consultation
          <br />
          Thu 11:00 with Dr. Paolo Lim
        </div>
      </div>
    </div>
  );
}

/** Floating card: a one-line assistant exchange. */
export function AssistantBubble({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "bg-card/95 ring-border/70 shadow-liquid-lg w-72 rounded-2xl p-3.5 text-xs ring-1 backdrop-blur",
        className,
      )}
    >
      <div className="bg-muted ml-auto w-fit max-w-[85%] rounded-xl rounded-br-sm px-3 py-2">
        Which invoices are still unpaid this week?
      </div>
      <div className="mt-2.5 flex gap-2">
        <span className="bg-primary text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-md">
          <Sparkles className="size-3.5" />
        </span>
        <div className="text-muted-foreground">
          <span className="text-foreground font-medium">4 invoices, ₱23,750 outstanding.</span> The
          largest is Carlo Tan&apos;s root canal (₱12,000), due Friday.
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Specialty illustrations                                                     */
/* -------------------------------------------------------------------------- */

type ToothMark = "caries" | "restoration" | "crown" | "missing" | "planned";

const UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
const MARKS: Partial<Record<number, ToothMark>> = {
  18: "missing",
  28: "missing",
  14: "restoration",
  46: "crown",
  36: "caries",
  26: "planned",
  11: "planned",
  21: "planned",
};

const MARK_STYLE: Record<ToothMark, string> = {
  caries:
    "bg-[color-mix(in_oklch,var(--tint-destructive-foreground)_55%,var(--card))] border-tint-destructive-foreground",
  restoration:
    "bg-[color-mix(in_oklch,var(--tint-info-foreground)_55%,var(--card))] border-tint-info-foreground",
  crown:
    "bg-[color-mix(in_oklch,var(--tint-primary-foreground)_55%,var(--card))] border-tint-primary-foreground",
  missing: "border-dashed",
  planned:
    "border-tint-warning-foreground ring-2 ring-[color-mix(in_oklch,var(--tint-warning-foreground)_35%,transparent)]",
};

function Tooth({ code, upper }: { code: number; upper: boolean }) {
  const mark = MARKS[code];
  const molar = code % 10 >= 6;
  return (
    <div
      className={cn(
        "flex flex-col items-center",
        !upper && "flex-col-reverse",
        mark === "missing" && "opacity-35",
      )}
    >
      <span className="text-muted-foreground mb-1 text-[10px] tabular-nums">{code}</span>
      {/* root */}
      <span
        className={cn(
          "border-foreground/20 block h-4 border",
          upper ? "rounded-t-full border-b-0" : "rounded-b-full border-t-0",
          molar ? "w-4" : "w-2.5",
          mark === "missing" && "border-dashed",
        )}
      />
      {/* crown */}
      <span
        className={cn(
          "bg-card border-foreground/25 relative block h-7 rounded-md border-[1.5px]",
          molar ? "w-6" : "w-[18px]",
          mark && MARK_STYLE[mark],
        )}
      >
        {mark === "missing" && (
          <svg viewBox="0 0 10 10" className="absolute inset-0 size-full p-0.5" aria-hidden>
            <path d="M1 1 9 9M9 1 1 9" stroke="currentColor" strokeWidth="1" />
          </svg>
        )}
      </span>
    </div>
  );
}

export function DentalMock() {
  return (
    <WindowChrome title="Juan Dela Cruz · Dental Chart">
      <div className="p-4 sm:p-6">
        <div className="overflow-x-auto">
          <div className="mx-auto w-fit min-w-max">
            <div className="flex gap-1">
              {UPPER.map((c) => (
                <Tooth key={c} code={c} upper />
              ))}
            </div>
            <div className="border-border my-2.5 border-t border-dashed" />
            <div className="flex gap-1">
              {LOWER.map((c) => (
                <Tooth key={c} code={c} upper={false} />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border p-3 text-xs">
            <div className="text-muted-foreground mb-1.5 text-[11px] font-medium tracking-wide uppercase">
              Tooth 36
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-tint-destructive text-tint-destructive-foreground rounded-md px-1.5 py-0.5 text-[11px] font-medium">
                Caries · O D
              </span>
              <span className="text-muted-foreground">noted 14 days ago</span>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="bg-tint-info text-tint-info-foreground rounded-md px-1.5 py-0.5 text-[11px] font-medium">
                Scheduled
              </span>
              <span className="text-muted-foreground">Composite restoration · Thu</span>
            </div>
          </div>
          <div className="rounded-xl border p-3 text-xs">
            <div className="text-muted-foreground mb-1.5 text-[11px] font-medium tracking-wide uppercase">
              Treatment plan
            </div>
            {[
              {
                t: "Veneers · 11, 21",
                s: "Planned",
                tone: "bg-tint-warning text-tint-warning-foreground",
              },
              {
                t: "Composite · 36",
                s: "Scheduled",
                tone: "bg-tint-info text-tint-info-foreground",
              },
              {
                t: "Composite · 14",
                s: "Completed",
                tone: "bg-tint-success text-tint-success-foreground",
              },
            ].map((r) => (
              <div key={r.t} className="flex items-center justify-between py-0.5">
                <span>{r.t}</span>
                <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-medium", r.tone)}>
                  {r.s}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </WindowChrome>
  );
}

export function MedicalMock() {
  return (
    <WindowChrome title="Ramon Cruz · Patient profile">
      <div className="p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="bg-tint-info text-tint-info-foreground flex size-10 items-center justify-center rounded-full text-sm font-semibold">
            RC
          </span>
          <div>
            <div className="text-sm font-semibold">Ramon Cruz</div>
            <div className="text-muted-foreground text-xs">
              58 · Patient since 2024 · Davao Branch
            </div>
          </div>
          <span className="bg-tint-success text-tint-success-foreground ml-auto rounded-md px-2 py-0.5 text-[11px] font-medium">
            Active
          </span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border p-3 text-xs">
            <div className="text-muted-foreground mb-2 text-[11px] font-medium tracking-wide uppercase">
              Follow-ups
            </div>
            {[
              {
                t: "Review lab results",
                d: "Due today",
                tone: "bg-tint-warning text-tint-warning-foreground",
              },
              { t: "BP recheck in 2 weeks", d: "Oct 22", tone: "bg-muted text-muted-foreground" },
              {
                t: "Medication review",
                d: "Done",
                tone: "bg-tint-success text-tint-success-foreground",
              },
            ].map((f) => (
              <div key={f.t} className="flex items-center justify-between gap-2 py-1">
                <span className="truncate">{f.t}</span>
                <span
                  className={cn(
                    "shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                    f.tone,
                  )}
                >
                  {f.d}
                </span>
              </div>
            ))}
          </div>
          <div className="rounded-xl border p-3 text-xs">
            <div className="text-muted-foreground mb-2 text-[11px] font-medium tracking-wide uppercase">
              Visit history
            </div>
            <ol className="relative ml-1.5 space-y-2.5 border-l pl-3.5">
              {[
                { t: "BP follow-up", d: "Today, 10:00 · Dr. Paolo Lim", icon: Stethoscope },
                { t: "Invoice paid · ₱1,500", d: "Sep 24 · Cash", icon: Receipt },
                { t: "Reminder sent", d: "Sep 23 · 24h before visit", icon: BellRing },
              ].map(({ t, d, icon: Icon }) => (
                <li key={t} className="relative">
                  <span className="bg-card text-primary absolute top-0.5 -left-[22px] flex size-4 items-center justify-center rounded-full border">
                    <Icon className="size-2.5" />
                  </span>
                  <div className="font-medium">{t}</div>
                  <div className="text-muted-foreground">{d}</div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </WindowChrome>
  );
}

export function AestheticMock() {
  return (
    <WindowChrome title="Inventory · Cebu Branch">
      <div className="p-4 sm:p-6">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold">Clinic stock</div>
          <span className="bg-tint-warning text-tint-warning-foreground rounded-md px-2 py-0.5 text-[11px] font-medium">
            2 need attention
          </span>
        </div>
        <div className="divide-y rounded-xl border text-xs">
          {[
            {
              n: "Botulinum toxin 100U",
              q: "12 vials",
              s: "Expires Nov 2026",
              tone: "bg-tint-warning text-tint-warning-foreground",
            },
            {
              n: "Hyaluronic filler 1 ml",
              q: "3 syringes",
              s: "Low stock",
              tone: "bg-tint-destructive text-tint-destructive-foreground",
            },
            {
              n: "Glycolic peel 30%",
              q: "6 bottles",
              s: "In stock",
              tone: "bg-tint-success text-tint-success-foreground",
            },
            {
              n: "Numbing cream 30 g",
              q: "18 tubes",
              s: "In stock",
              tone: "bg-tint-success text-tint-success-foreground",
            },
          ].map((r) => (
            <div key={r.n} className="flex items-center gap-3 px-3 py-2.5">
              <span className="min-w-0 flex-1 truncate font-medium">{r.n}</span>
              <span className="text-muted-foreground hidden tabular-nums sm:block">{r.q}</span>
              <span
                className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium", r.tone)}
              >
                {r.s}
              </span>
            </div>
          ))}
        </div>
        <div className="bg-tint-primary text-tint-primary-foreground mt-3 flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs">
          <Check className="size-3.5 shrink-0" />
          <span>
            <span className="font-medium">Botox — forehead completed.</span> 1 vial deducted from
            stock automatically.
          </span>
        </div>
      </div>
    </WindowChrome>
  );
}

/* -------------------------------------------------------------------------- */
/* AI assistant conversation                                                   */
/* -------------------------------------------------------------------------- */

export function AssistantMock() {
  return (
    <WindowChrome title="CareFlow Assistant">
      <div className="space-y-4 p-4 text-[13px] sm:p-6">
        <div className="bg-muted ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2.5">
          How many no-shows did we have last week?
        </div>
        <div className="flex gap-2.5">
          <span className="bg-primary text-primary-foreground flex size-7 shrink-0 items-center justify-center rounded-lg">
            <Sparkles className="size-4" />
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-muted-foreground">
              <span className="text-foreground font-medium">6 no-shows</span> across both branches,
              down from 9 the week before. Most were Monday mornings.
            </p>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {[
                { l: "Davao", v: "4" },
                { l: "Cebu", v: "2" },
                { l: "No-show rate", v: "5.1%" },
              ].map((s) => (
                <div key={s.l} className="rounded-lg border px-2.5 py-2">
                  <div className="text-muted-foreground">{s.l}</div>
                  <div className="text-base font-semibold">{s.v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-muted ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2.5">
          Book Bea Santos for a cleaning with Dr. Reyes, Thursday 3 PM.
        </div>
        <div className="flex gap-2.5">
          <span className="bg-primary text-primary-foreground flex size-7 shrink-0 items-center justify-center rounded-lg">
            <Sparkles className="size-4" />
          </span>
          <div className="min-w-0 flex-1 rounded-xl border p-3">
            <div className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
              Confirm appointment
            </div>
            <div className="mt-1 font-medium">Bea Santos · Teeth cleaning</div>
            <div className="text-muted-foreground text-xs">
              Thu, Oct 8 · 3:00–3:45 PM · Dr. Ana Reyes · Davao
            </div>
            <div className="mt-3 flex gap-2">
              <span className="bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-xs font-medium">
                Confirm booking
              </span>
              <span className="rounded-lg border px-3 py-1.5 text-xs font-medium">Cancel</span>
            </div>
          </div>
        </div>
      </div>
    </WindowChrome>
  );
}
