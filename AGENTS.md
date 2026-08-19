# chris-mercer.github.io

Personal site for Christopher Mercer: an interactive Astro + Three.js
portfolio, deployed to GitHub Pages at
[christophermercer.org](https://christophermercer.org). This file is for
coding agents; see `README.md` for the human-facing summary.

## Setup commands

- Install: `pnpm install`
- Dev server: `pnpm dev`
- Production build: `pnpm build`
- Preview the production build: `pnpm preview`
- Type and template diagnostics: `pnpm check` (runs `astro check`)

There is no `lint` or `test` script in `package.json`. Do not assume either
exists, and do not invent a call to one. `pnpm check` is the closest thing to
a type-check gate this repo has — run it, and `pnpm build`, before treating a
change as done.

## Stack

- [Astro](https://astro.build) 7.x — static output, no server runtime
- [React](https://react.dev) 19.x via `@astrojs/react`, used only for the
  WebGL hero (`src/components/ElkScene.tsx` and its subtree) — everything
  else is plain `.astro`
- [Three.js](https://threejs.org) via `@react-three/fiber`, `@react-three/drei`,
  `@react-three/postprocessing`
- TypeScript 6.x, extending `astro/tsconfigs/strict`
- pnpm — see `pnpm-lock.yaml`; CI pins `pnpm@10`
- Node.js >=24 (`engines.node` in `package.json`)
- No Tailwind, no CSS framework — styling is scoped `<style>` blocks inside
  individual `.astro` components
- No ESLint or Prettier config anywhere in this repo — nothing enforces style
  automatically

## Structure

```
src/
├── pages/index.astro          # the only route
├── layouts/Layout.astro       # page shell, head/meta
├── components/
│   ├── Scene.astro, Hud.astro, InfoPanel.astro   # static chrome, plain Astro
│   └── ElkScene.tsx + ElkScene/*.ts(x)           # the R3F/Three.js hero — the one React island
└── hooks/                      # useDeviceCapability, useMediaQuery, useReducedMotion
public/                         # favicons, robots.txt, sitemap.xml, llms.txt, manifest.json, CNAME, the .glb model
scripts/og-image.html           # standalone helper for generating the OG share image; not wired into any package.json script
```

## Deploy

`.github/workflows/deploy.yml` builds with `withastro/action` (pnpm 10,
Node 24) on every push to `main`, and deploys straight to GitHub Pages —
there is no staging environment. `public/CNAME` pins the custom domain.

## Branching

Work directly on `main`. Every commit in this repo's history is
direct-to-main, there are no other contributors or branches, and a bad
deploy is a `git revert` plus a few minutes' rebuild, not a rollback event.
Pushing is still its own confirmation step regardless of branch.

## Code style

Single quotes, semicolons, 2-space indentation (see any file under `src/`).
No linter enforces this — match it by hand.

## Testing

No test suite exists. If one is ever added, wire it into `package.json`'s
`scripts.test` and update this file and `.github/copilot-instructions.md` to
match — do not leave either file claiming a command that isn't real.

## Security

No secrets, API keys, or server-side code in this repo — it is a static site
with no backend. Never commit `.env*` files (`.env.example` is the only
exception) or credentials regardless.

## Dependencies

Automated dependency updates are deliberately off. `.github/dependabot.yml`
carries `open-pull-requests-limit: 0`, and Dependabot security alerts are
disabled at the repository level. Both are decisions, not oversights: this is a
static site with a small, stable dependency set and no backend, and a weekly
stream of update PRs would cost more attention than it buys. Do not enable
either as a fix, and do not read the absent cooldown block as a missing
control — it would gate nothing while the limit is zero, and goes in at the
moment the limit is raised.

The control that is actually in force is install-time rather than PR-time: the
maintainer's package manager refuses to resolve anything published within the
last 7 days, which is the window a compromised release is typically caught in.
Nothing bypasses that gate, a security advisory included. It lives in the
maintainer's environment rather than in this repo, so a clone does not inherit
it — set an equivalent before installing if you are working from one.

Dependency changes are reviewed before they land; see Boundaries.

## Boundaries

- Retired site versions (`static-site-v1/`, `v2/`, `v3/`) are deliberately not
  tracked. Each was a snapshot of a state this repo's own git history already
  holds, so keeping them in the working tree duplicated history. Recover one
  with `git log -- archive/` and `git show` if it is ever needed. Do not
  restore them into the tracked tree, and do not read their absence as work to
  undo.
- `public/CNAME`, `public/robots.txt`, `public/sitemap.xml`, and the SEO/social
  metadata in `src/layouts/Layout.astro` are live in production. Changing
  them changes what search engines and link previews show — ask first.
- Ask before adding a dependency, or changing `package.json`, `tsconfig.json`,
  or `astro.config.mjs`.
- This repo is MIT-licensed — a deliberate choice. Do not change `LICENSE` or
  suggest a different license.
