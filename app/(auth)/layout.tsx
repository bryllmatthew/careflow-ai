export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="bg-muted/30 flex min-h-dvh flex-col items-center justify-center gap-8 p-6">
      <div className="text-lg font-semibold tracking-tight">CareFlow AI</div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
