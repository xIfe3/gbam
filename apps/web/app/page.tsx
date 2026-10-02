import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-6">
      <h1 className="text-4xl font-bold tracking-tight">Gbam</h1>
      <p className="text-lg text-zinc-600">
        Your shop link for WhatsApp. Customers order, you get paid, everyone gets updates.
      </p>
      <div className="flex gap-3">
        <Link
          href="/dashboard"
          className="rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700"
        >
          Seller dashboard
        </Link>
        <Link
          href="/mama-ngozi"
          className="rounded-lg border border-zinc-300 px-4 py-2 font-medium"
        >
          Demo store
        </Link>
      </div>
    </main>
  );
}
