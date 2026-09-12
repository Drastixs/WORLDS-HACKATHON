# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Global Agent Instructions (Codex)

## Working Style

- Take terse prompts at face value. Infer intent, make reasonable decisions, and proceed unless genuinely blocked. Do not pad, gold-plate, or add unrequested scope.
- Use a design-first loop for non-trivial requests. Briefly sketch the proposed approach, then implement end to end once the user says to build it.
- Optimize for outcomes rather than named files. Inspect the codebase and identify the right files. If the user names a file that appears incorrect, say so instead of forcing the solution into it.

## Mirror AGENTS.md ↔ CLAUDE.md with a symlink

## Package Install Policy

- Before installing a large or critical dependency, run a package security review using a subagent and block installation until the review is acceptable.
- This applies to runtime frameworks, authentication, payments, cryptography, global system tools, and third-party agent skills or plugins.
- Skip the review for lockfile-only changes, standard-library dependencies, already-vetted packages, and trivial well-known utilities.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
