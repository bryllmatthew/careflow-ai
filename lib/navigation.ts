import type { Permission } from "@/lib/auth/permissions";
import {
  LayoutDashboard,
  Sparkles,
  Users,
  CalendarClock,
  Calendar,
  CalendarCheck,
  Globe,
  ShoppingCart,
  Receipt,
  Wallet,
  Package,
  Boxes,
  Truck,
  ClipboardList,
  UserCog,
  Building2,
  Stethoscope,
  BarChart3,
  PiggyBank,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  /**
   * Omit for items every active member should see regardless of role
   * (Dashboard). An array means "holding ANY one of these is enough" -- e.g.
   * Patients is visible to both a receptionist (patients.view) and a
   * practitioner who holds only patients.view.assigned; a single-permission
   * field would hide it from the practitioner entirely.
   */
  permission?: Permission | Permission[];
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

/**
 * The 8 sections and their items from docs/UI_UX_SPEC.md, each gated by the
 * permission that would let a real page there do anything useful. All 26
 * routes exist as permission-gated empty states as of Task 1.10 (see
 * app/(app)/*), filled in by their own phase -- see CLAUDE.md's roadmap
 * table. A section disappears entirely when none of its items are visible.
 *
 * One deliberate deviation from the spec: it lists "Clinic" under Settings
 * as well as "Clinics" under Management. Maintaining two screens for the
 * same entity is exactly the redundant-navigation complexity
 * docs/UI_UX_SPEC.md itself warns against, so only Management > Clinics
 * exists; Settings has no separate Clinic item.
 */
export const NAVIGATION: NavSection[] = [
  {
    title: "Overview",
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { title: "AI Assistant", href: "/assistant", icon: Sparkles, permission: "ai.use" },
    ],
  },
  {
    title: "Patients",
    items: [
      {
        title: "Patients",
        href: "/patients",
        icon: Users,
        permission: ["patients.view", "patients.view.assigned"],
      },
      {
        title: "Follow-ups",
        href: "/followups",
        icon: CalendarClock,
        permission: "followups.view",
      },
    ],
  },
  {
    title: "Schedule",
    items: [
      { title: "Calendar", href: "/calendar", icon: Calendar, permission: "appointments.view" },
      {
        title: "Appointments",
        href: "/appointments",
        icon: CalendarCheck,
        permission: "appointments.view",
      },
      {
        title: "Online Booking",
        href: "/booking",
        icon: Globe,
        permission: "booking.view",
      },
    ],
  },
  {
    title: "Sales",
    items: [
      { title: "Sales", href: "/sales", icon: ShoppingCart, permission: "sales.view" },
      { title: "Invoices", href: "/invoices", icon: Receipt, permission: "invoices.view" },
      { title: "Payments", href: "/payments", icon: Wallet, permission: "payments.view" },
    ],
  },
  {
    title: "Inventory",
    items: [
      { title: "Products", href: "/products", icon: Package, permission: "inventory.view" },
      { title: "Inventory", href: "/inventory", icon: Boxes, permission: "inventory.view" },
      { title: "Suppliers", href: "/suppliers", icon: Truck, permission: "suppliers.view" },
      {
        title: "Purchase Orders",
        href: "/purchase-orders",
        icon: ClipboardList,
        permission: "purchase_orders.view",
      },
    ],
  },
  {
    title: "Management",
    items: [
      { title: "Staff", href: "/staff", icon: UserCog, permission: "staff.manage" },
      { title: "Clinics", href: "/clinics", icon: Building2, permission: "clinic.view" },
      { title: "Services", href: "/services", icon: Stethoscope, permission: "services.view" },
    ],
  },
  {
    title: "Reports",
    items: [
      {
        title: "Business Reports",
        href: "/reports/business",
        icon: BarChart3,
        permission: "reports.view",
      },
      {
        title: "Financial Reports",
        href: "/reports/financial",
        icon: PiggyBank,
        permission: "reports.financial",
      },
      {
        title: "Inventory Reports",
        href: "/reports/inventory",
        icon: Warehouse,
        permission: "reports.inventory",
      },
    ],
  },
  {
    title: "Settings",
    items: [
      {
        title: "Organization",
        href: "/settings/organization",
        icon: Building2,
        permission: "organization.view",
      },
      { title: "Users", href: "/settings/users", icon: Users, permission: "users.view" },
      { title: "Roles", href: "/settings/roles", icon: UserCog, permission: "roles.view" },
      {
        title: "Notifications",
        href: "/settings/notifications",
        icon: Sparkles,
        permission: "automations.view",
      },
      {
        title: "Integrations",
        href: "/settings/integrations",
        icon: Boxes,
        permission: "integrations.manage",
      },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAVIGATION.flatMap((section) => section.items);
