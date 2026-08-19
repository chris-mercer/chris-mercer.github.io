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

`.github/dependabot.yml` configures weekly version updates for two ecosystems:
`npm`, which is the key pnpm resolves under (Dependabot has no separate `pnpm`
value), and `github-actions`, for the three actions pinned in
`.github/workflows/deploy.yml`. Both carry a 7-day cooldown, 21 days for
majors, so a freshly published version is not proposed until it has been public
long enough for a compromised release to surface.

That cooldown gates *version* updates. The immediate-security-patch path is a
separate repository setting rather than anything this file controls, and on
this repo it is **off** — `GET /repos/{owner}/{repo}/vulnerability-alerts`
returned "Vulnerability alerts are disabled" on 2026-08-19. So the config above
currently delivers scheduled version updates and nothing else. Re-check rather
than trusting this sentence; turning alerts on is an operator decision, not a
change to `dependabot.yml`.

Ask before adding, removing, or upgrading a dependency — see Boundaries.

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
