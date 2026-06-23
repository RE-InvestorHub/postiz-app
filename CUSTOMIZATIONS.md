# Re:InvestorHub Customizations — Postiz fork

This is a fork of [`gitroomhq/postiz-app`](https://github.com/gitroomhq/postiz-app),
maintained at `RE-InvestorHub/postiz-app`, embedded as a git submodule inside the
Re:InvestorHub marketing workspace.

> **Read before editing any file in this repo.** Keep our footprint tiny and additive so
> the fork stays merge-safe against a fast-moving AGPL upstream.

## Canonical documentation

The full fork-maintenance guide — branch model, additive-only discipline, the
upstream-file **touch-points table**, the upstream-merge runbook, and local dev quickstart
— is maintained in the parent marketing workspace via `hit-em-with-the-docs`:

- **`.documentation/procedures/postiz-fork-maintenance.md`** (canonical; keep it current)
- Design-system rules for embedded UI: **`.documentation/postiz/design-system.md`**
  and the enforcing rule **`.claude/rules/postiz-design-system.md`**
- Initiative plan: **`.planning/postiz-embedded-claude-agent/`**

## The two rules you must not forget

1. **Additive-only.** New code in new files/dirs. Never edit Postiz's Mastra agent
   (`chat/tools/tool.list.ts`, `chat/load.tools.service.ts`). Log any unavoidable
   upstream-file edit in the touch-points table in the canonical doc above.
2. **`main` stays a pristine upstream mirror; all customization lives on `reinvestorhub`.**
