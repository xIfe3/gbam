// Soft coral and green glows on blush, shared by every auth page. Each page supplies its own
// <main> (centered card, or the guided sign-up frame).
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_15%_20%,var(--color-coral-tint)_0,transparent_35%),radial-gradient(circle_at_85%_85%,var(--color-brand-tint)_0,transparent_40%)]">
      {children}
    </div>
  );
}
