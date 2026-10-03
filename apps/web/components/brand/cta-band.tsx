import { Button } from "./button";

// The closing "Ready? Gbam." call to action at the bottom of marketing pages.
// "Gbam." is large display text in coral-tint (coral itself is too faint on green).
export function CtaBand() {
  return (
    <section className="bg-brand mx-4 my-12 rounded-3xl px-6 py-12 text-center text-white sm:mx-auto sm:max-w-5xl">
      <h2 className="font-display text-4xl font-black sm:text-5xl">
        Ready? <span className="text-coral-tint">Gbam.</span>
      </h2>
      <p className="mx-auto mt-3 max-w-md text-white">
        Set up your shop link in minutes and start taking paid orders on WhatsApp.
      </p>
      <div className="mt-6 flex justify-center">
        <Button href="/signup" variant="secondary" size="lg" tone="dark">
          Start selling free
        </Button>
      </div>
    </section>
  );
}
