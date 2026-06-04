# Re:InvestorHub Customizations — Postiz fork

This is a fork of [`gitroomhq/postiz-app`](https://github.com/gitroomhq/postiz-app),
maintained at `RE-InvestorHub/postiz-app`, embedded as a git submodule inside the
Re:InvestorHub marketing workspace.

> **Read this before editing any file in this repo.** The whole point of this fork is to
> stay merge-safe against a fast-moving AGPL upstream. Keep our footprint tiny and additive.

## Branch model

| Branch | Role | Rule |
|---|---|---|
| `main` | Pristine mirror of `upstream/main` | **Never commit custom code here.** Fast-forward only. |
| `reinvestorhub` | Long-lived integration branch | All customizations live here. Merge `upstream/main` in on a cadence. |
| feature branches | Per-change work | Branch off `reinvestorhub`, PR back into it. |

Remotes: `origin` = `RE-InvestorHub/postiz-app` (our fork), `upstream` =
`gitroomhq/postiz-app`. `git rerere` is enabled so repeat conflict resolutions auto-apply.

## The golden rule: additive-only

- **Put new code in NEW files/dirs.** New files never conflict on merge.
- **The brain, the Remotion render service, and the Postiz REST adapter live OUTSIDE this
  repo** (in the marketing workspace). Do not add them here.
- **Depend only on Postiz's stable public interfaces** (its MCP server + REST API). Do NOT
  add tools to Postiz's Mastra agent or edit `chat/tools/tool.list.ts` /
  `chat/load.tools.service.ts` — that code churns hard upstream.
- Every unavoidable edit to an existing upstream file goes in the table below.

## Upstream-file touch-points (keep this current)

Each row is a place we modified an existing upstream file. Re-verify these on every
upstream merge.

| File | Change | Why | Added |
|---|---|---|---|
| _(none yet)_ | | | |

Planned touch-points (see workspace plan `.planning/postiz-embedded-claude-agent/`):
- `apps/frontend/src/app/(app)/layout.tsx` — mount the Re:InvestorHub floating chat widget
  (one line). The widget itself is new files under `apps/frontend/src/components/`.
- `libraries/nestjs-libraries/src/videos/video.module.ts` — ONLY if we later add a native
  Remotion video provider (optional; default is brain-orchestrated, no edit).

## Embedded UI must match Postiz branding

Any UI we add inside this repo (floating panel, approval controls) must conform to
**Postiz's own design system** — colors, typography, components — so it feels native.
Reference: `.documentation/features/postiz/design-system.md` in the marketing workspace,
and the rule `.claude/rules/postiz-design-system.md`. Re:InvestorHub brand governs
content/video output, NOT the in-Postiz chrome.

## Upstream-merge runbook

Run on a cadence (e.g. weekly) to absorb upstream changes safely.

```bash
# from the submodule root (./postiz)
git fetch upstream
git checkout main && git merge --ff-only upstream/main && git push origin main   # keep mirror pristine
git checkout reinvestorhub
git merge upstream/main          # rerere auto-applies known conflict resolutions
# resolve any new conflicts, focusing on the touch-points table above
pnpm install && pnpm run build   # verify it still builds
git push origin reinvestorhub
git tag reinvestorhub-$(git -C . rev-parse --short HEAD)   # optional checkpoint
# then in the parent workspace repo: bump the submodule pointer + commit
```

If a merge breaks something, the touch-points table tells you exactly which of our edits
to re-check first.
