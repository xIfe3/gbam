import { finishSetupAction } from "./actions";

/** The 10 one-time backup codes, shown once right after accepting the invite. */
export function BackupCodes({ codes, sessionToken }: { codes: string[]; sessionToken: string }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-ink font-bold">Save your backup codes</h2>
      <p className="text-ink-muted text-sm">
        If you lose your phone, each of these lets you sign in once instead of a code from the app.
        Write them down or save them in a password manager. You won&apos;t see them again.
      </p>
      <ul className="bg-brand-tint grid grid-cols-2 gap-2 rounded-xl p-4 font-mono text-sm">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      {/* A form so the button runs the server action that signs them in. */}
      <form action={finishSetupAction.bind(null, sessionToken)}>
        <button
          type="submit"
          className="bg-brand hover:bg-brand-hover inline-flex min-h-11 w-full items-center justify-center rounded-full px-5 font-bold text-white"
        >
          I&apos;ve saved them, continue
        </button>
      </form>
    </div>
  );
}
