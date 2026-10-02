# gbam: notes for AI assistants

## Code style: plain over clever

This codebase is maintained by someone learning the stack. Prefer code a beginner can read
top to bottom over code that is short. When in doubt, write it out.

- `async`/`await` with `try`/`catch`. No `.then(onOk, onError)` chains.
- `if`/`else` instead of ternaries (`a ? b : c`), except trivial ones in JSX like
  `{error && <p>…</p>}`. Never nest ternaries.
- `for` loops instead of `reduce`, and instead of long `.filter().map()` chains.
- No `!` non-null assertions. Check the value and throw an `Error` with a clear message.
- Name intermediate values instead of nesting calls inside calls.
- No `??=` or other compressed operators.
- One short comment wherever a concept may be new (dependency injection, transactions,
  row locks, queues, idempotency): say _why_, not just _what_.
- Framework syntax that can't be avoided (decorators, Zod schemas, Drizzle queries) is fine.
  Comment it the first time it appears in a file.

## Workflow

- Work in phases. The owner reviews each phase before it's committed.
- Run `pnpm turbo run build typecheck lint test` before saying something works.
- The owner may have `pnpm dev` running. Don't kill it.
- Tests use Redis db 1 so a running dev worker never consumes test jobs.
