# Real Claude harness loads the reworded firstmate-orca skill

Isolated project dir, no Firstmate hooks (`--settings` = `{}`).
Skills delivered exactly as the product does it: `.claude/skills -> .agents/skills`.

Prompt (identical in both runs):

> Invoke the firstmate-orca skill using the Skill tool, then reply with ONLY the
> single sentence from that skill that names which skill owns direct Orca worktree,
> terminal, repository, handoff, and embedded-browser operations.
> If the firstmate-orca skill is not available to you, reply exactly: SKILL_NOT_AVAILABLE

## POSITIVE - skills symlink present (this worktree's .agents/skills)

```
$ cd /tmp/fm-skill-live-check   # .claude/skills -> <worktree>/.agents/skills
$ claude -p "<prompt>" --output-format json --max-turns 4 --settings .claude/settings.json

"num_turns": 3, "is_error": false, "subtype": "success"
"result": "The `orca-cli` skill owns direct Orca worktree, terminal, repository,
           handoff, and embedded-browser operations outside the Firstmate lifecycle."
```

The agent used the Skill tool and quoted the ownership sentence from the skill body.

## NEGATIVE CONTROL - no skills symlink

```
$ cd /tmp/fm-skill-neg-check    # no .claude/skills
$ claude -p "<same prompt>" --output-format json --max-turns 4 --settings .claude/settings.json

"num_turns": 1, "is_error": false
"result": "The `firstmate-orca` skill is not available to me.\n\nSKILL_NOT_AVAILABLE"
```

The control discriminates: the positive result is caused by the skill being
loadable, not by the model guessing. The new multi-line YAML `>-` description
does not break skill registration.
