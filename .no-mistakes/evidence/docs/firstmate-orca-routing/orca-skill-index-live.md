# Live Orca skill index (real `orca` 1.4.206 runtime reading this worktree's .agents/skills)

## $ orca skills installed | grep -A3 '^firstmate-orca'
```
firstmate-orca (38d32567275ba3f4)
  Agent-only checklist for Firstmate's Orca runtime backend. Use before Orca-backed task work or when choosing between Firstmate helpers and the `orca-cli` skill.
  Repo 01M343F7J7NWAPTKDN5R96EVX4 .agents
fmx-respond (e7424a805188f9d0)
```

## $ orca skills installed | grep -A3 '^orca-cli'
```
orca-cli (8818f7dc085c37ec)
  Use the public `orca` CLI to operate Orca-managed worktrees, folder contexts, terminals, repos, automations, worktree comments, and the browser embedded inside the Orca app. Use when the user says "$orca-cli", "use orca cli", "Orca worktree", "child worktree", "cardStatus", "spawn codex/claude in a worktree", "read/wait/send Orca terminal", "terminal send", "full handoff", "handover", "give this to another agent", "another worktree", "Orca browser", or "control the browser inside Orca". Prefer this over raw `git worktree`, ad hoc PTYs, Playwright, or Computer Use when the task touches Orca-managed state. Use Computer Use for browser windows, webviews, or desktop UI outside Orca's embedded browser.
  Agent skills home
orca-emulator (7c8834f1a5a2fe21)
```

## $ orca skills get orca-cli   (version-matched guide from the selected binary)
```
---
name: orca-cli
description: >-
  Operate Orca-managed worktrees, folder contexts, terminals, repos, automations, artifacts,
  skill sharing, worktree comments, and Orca's embedded browser through the `orca` CLI. Use
  when the user says "$orca-cli", "Orca worktree", "child worktree", "spawn codex/claude in a
  worktree", "read/wait/send Orca terminal", "handoff" / "handover" / "give this to another
  agent", "Orca browser", "orca artifacts", or "share skills". Prefer it over raw git
  worktree, ad hoc PTYs, or Computer Use when Orca state is involved. Use Computer Use only
  when a visible window needs GUI control that a CLI, filesystem, or API cannot do.
---

... (guide continues; exit code 0)
```
