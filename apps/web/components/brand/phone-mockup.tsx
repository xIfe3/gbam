// A phone frame (dark bezel + screen) that wraps whatever UI is shown inside it.
export function PhoneMockup({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-ink relative h-[380px] w-[190px] shrink-0 rounded-[34px] p-2 shadow-2xl shadow-ink/30">
      <div className="bg-brand-tint flex h-full w-full flex-col overflow-hidden rounded-[27px] text-left">
        {children}
      </div>
    </div>
  );
}
