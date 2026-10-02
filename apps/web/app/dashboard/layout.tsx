import Link from "next/link";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <Link href="/dashboard" className="text-xl font-bold">
          Gbam <span className="font-normal text-zinc-500">· Orders</span>
        </Link>
        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
          dev seller (no login yet)
        </span>
      </header>
      {children}
    </div>
  );
}
