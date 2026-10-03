import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/sections";

/**
 * The public marketing site. It lives in its own route group so it can move
 * to its own subdomain later (e.g. the apex domain for marketing, `app.` for
 * the product) without touching the authenticated app.
 */
export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
