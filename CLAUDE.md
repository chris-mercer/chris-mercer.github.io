<!--
  Intentionally minimal. This repo's real instructions live in AGENTS.md at
  the repo root (portable, read by every coding-agent tool). This file just
  makes Claude Code load that content automatically: Claude Code reads
  CLAUDE.md, not AGENTS.md, by its own documentation
  (code.claude.com/docs/en/memory, "AGENTS.md" section) — without an import
  or a symlink here, AGENTS.md would only surface if a session happened to
  read it during normal exploration, not at session start.

  Committed on purpose. The whole point of this file is the automatic load,
  and an ignored copy delivers that to one working tree and to no clone.
  It holds a pointer and nothing else, so there is nothing here to keep
  private; anything machine-local belongs in CLAUDE.local.md or .local/,
  both of which .gitignore holds back.
-->

@AGENTS.md
