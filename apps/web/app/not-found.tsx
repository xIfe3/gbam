import { Button } from "@/components/brand/button";
import { Logo } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12 text-center">
      <Logo size="md" />
      <p className="text-coral-deep mt-10 text-sm font-bold tracking-widest uppercase">404</p>
      <h1 className="font-display text-ink mt-2 max-w-md text-4xl leading-tight font-black">
        This page went gbam the wrong way
      </h1>
      <p className="text-ink-muted mt-4 max-w-md text-lg">
        We can&apos;t find what you were looking for. The link may be old or mistyped.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button href="/" variant="primary" size="lg">
          Back to home
        </Button>
        <Button href="/help" variant="secondary" size="lg">
          Visit the help centre
        </Button>
      </div>
    </main>
  );
}
