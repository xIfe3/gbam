import { StepRail } from "@/components/brand/step-rail";

// The guided sign-up layout shared by steps 1 to 3: rail (or progress bar) plus a form column.
export function SignupFrame({
  step,
  title,
  subtitle,
  children,
}: {
  step: number;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col md:flex-row">
      <div className="px-4 pt-6 md:contents">
        <StepRail current={step} />
      </div>
      <main className="flex-1 px-4 py-8 md:px-14 md:py-14">
        <div className="max-w-md">
          <h1 className="font-display text-ink text-3xl font-black">{title}</h1>
          <p className="text-ink-muted mt-2 text-base">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
