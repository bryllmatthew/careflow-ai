import { Logo } from "@/components/brand/logo";

export default function OnboardingLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="bg-muted/30 flex min-h-dvh flex-col items-center justify-center gap-8 p-6">
      <Logo href="/" size="lg" />
      <div className="w-full max-w-lg">{children}</div>
    </div>
  );
}
