<!--
  SELF-CONTAINED relative to AGENTS.md, decided 2026-07-27: this is a public
  repo, and GitHub's own documentation lists several Copilot surfaces that
  never read AGENTS.md at all — github.com Chat, VS Code code review, Visual
  Studio, and the Chat/code-review surfaces of JetBrains, Eclipse and Xcode
  (docs.github.com/en/copilot/reference/custom-instructions-support). A
  public repo's audience of Copilot users is not limited to one person's
  toolchain, so at least one of those surfaces is always plausibly in play —
  which is why this file duplicates AGENTS.md rather than delegating to it.
  Keep the two in sync rather than letting them diverge.
-->

# GitHub Copilot Instructions: chris-mercer.github.io

## Project

Personal site for Christopher Mercer — an interactive Astro + Three.js
portfolio deployed to GitHub Pages at
[christophermercer.org](https://christophermercer.org).

## Stack

| Technology | Version                                 |
| ---------- | --------------------------------------- |
| Node.js    | 24.x (`engines.node` in `package.json`) |
| Astro      | 7.x                                     |
| React      | 19.x (one island only — see Key Rules)  |
| TypeScript | 6.x (`astro/tsconfigs/strict`)          |
| pnpm       | 10.x                                    |

No Tailwind, no CSS framework — styling is scoped `<style>` blocks per
`.astro` component. No ESLint or Prettier config anywhere in this repo.

## Commands

```bash
pnpm install    # Dependencies
pnpm dev        # Dev server
pnpm build      # Production build
pnpm preview    # Preview the production build
pnpm check      # astro check — type and template diagnostics
```

No `lint` or `test` script exists. Do not run or suggest one that isn't
defined in `package.json`.

## Key Rules

1. TypeScript strict mode (`astro/tsconfigs/strict`) — no `any` without
   justification
2. Only `src/components/ElkScene.tsx` and its `ElkScene/` subtree are React;
   everything else is plain `.astro`
3. Match existing style by hand: single quotes, semicolons, 2-space indent —
   nothing enforces it automatically
4. Run `pnpm check` and `pnpm build` before treating a change as done

## Protected Files

Ask before modifying:

- `package.json`, `pnpm-lock.yaml`
- `tsconfig.json`, `astro.config.mjs`
- `public/CNAME`, `public/robots.txt`, `public/sitemap.xml`
- `LICENSE` — MIT, a deliberate choice; do not change it or suggest a
  different license

## Structure

```
src/
├── pages/index.astro
├── layouts/Layout.astro
├── components/                 # Scene.astro, Hud.astro, InfoPanel.astro (static) + ElkScene.tsx (React/R3F)
└── hooks/
public/                         # static assets, favicons, SEO files, the .glb model
scripts/og-image.html           # standalone helper, not wired into any script
```

## Deploy

Push to `main` triggers `.github/workflows/deploy.yml`, which builds with
`withastro/action` and deploys to GitHub Pages. No staging environment
exists — a push to `main` is a production deploy.

## Branching

Work directly on `main` — every commit in this repo's history is
direct-to-main, there are no other contributors, and a bad deploy is a
revert and a rebuild, not a rollback event.

## Dependencies

`.github/dependabot.yml` runs weekly version updates for `npm` (the key pnpm
resolves under — there is no separate `pnpm` value) and `github-actions`, both
with a 7-day cooldown and 21 days for majors.

That cooldown gates version updates only. The immediate-security-patch path is
a repository setting, and on this repo it is off — the API reported
vulnerability alerts disabled on 2026-08-19. Re-check rather than trusting this
sentence.

## Validation

Before committing:

```bash
pnpm check   # Must pass
pnpm build   # Must succeed
```

## Don't

- Commit `.env` files or secrets (there are none checked in; keep it that way)
- Add a dependency, or touch `package.json`/`tsconfig.json`/`astro.config.mjs`,
  without asking first
- Restore the retired site versions (`static-site-v1/`, `v2/`, `v3/`) into the
  tracked tree — they are untracked on purpose, and git history already holds
  them
- Change the license
