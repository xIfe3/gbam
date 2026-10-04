import { Check } from "lucide-react";
import Link from "next/link";
import { Logo } from "./logo";

const STEPS = [
  { title: "Your shop", detail: "name & link" },
  { title: "Verify", detail: "6-digit code" },
  { title: "Get paid", detail: "bank details" },
];

type StepRailProps = {
  // 1, 2 or 3
  current: number;
};

// The guided sign-up frame: a green rail on desktop, a progress bar on phones.
// All rail text is white on brand green (about 5:1); the current step is marked by weight
// and a filled marker, not by dimming, so contrast never drops.
export function StepRail({ current }: StepRailProps) {
  const total = STEPS.length;
  const currentStep = STEPS[current - 1];

  const bars = [];
  const items = [];
  for (let i = 0; i < total; i++) {
    const number = i + 1;
    const step = STEPS[i];
    if (!step) {
      continue;
    }
    let barColor = "bg-brand-tint";
    if (number <= current) {
      barColor = "bg-brand";
    }
    bars.push(<span key={number} className={`h-2 flex-1 rounded-full ${barColor}`} />);

    let marker = (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-white text-sm font-bold text-white">
        {number}
      </span>
    );
    if (number < current) {
      marker = (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white">
          <Check size={18} className="text-brand" aria-hidden="true" />
        </span>
      );
    } else if (number === current) {
      marker = (
        <span className="text-brand flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-sm font-black">
          {number}
        </span>
      );
    }
    let aria: "step" | undefined = undefined;
    if (number === current) {
      aria = "step";
    }
    items.push(
      <li key={number} aria-current={aria} className="flex items-center gap-3 text-white">
        {marker}
        <span>
          <b className="block">{step.title}</b>
          <span className="text-sm">{step.detail}</span>
        </span>
      </li>,
    );
  }

  return (
    <>
      <aside className="bg-brand hidden w-72 shrink-0 flex-col gap-8 p-8 md:flex">
        <Link
          href="/"
          className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
        >
          <Logo size="md" variant="on-dark" />
        </Link>
        <nav aria-label="Sign-up progress">
          <ol className="flex flex-col gap-6">{items}</ol>
        </nav>
      </aside>
      <div className="md:hidden">
        <Link
          href="/"
          className="focus-visible:outline-brand inline-block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          <Logo size="sm" />
        </Link>
        <p className="text-ink-muted mt-4 text-sm font-medium">
          Step {current} of {total}
          {currentStep ? ` · ${currentStep.title}` : ""}
        </p>
        <div className="mt-2 flex gap-2" aria-hidden="true">
          {bars}
        </div>
      </div>
    </>
  );
}
