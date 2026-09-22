# Live routing observation: both skills present, real Claude harness

Isolated project, no Firstmate hooks. Skills staged the way the product exposes them:

- `.claude/skills/firstmate-orca` -> this worktree's changed skill
- `.claude/skills/orca-cli`       -> version-matched guide from the selected binary
                                    (`orca skills get orca-cli`, orca 1.4.206)

## Prompt

> You are working in a Firstmate home. Two separate jobs, answer both, no tool calls
> other than loading skills:
> (A) I need to create a new Orca child worktree by hand for some ad-hoc exploration,
>     outside any Firstmate task.
> (B) A Firstmate-supervised Orca task fm-1234 seems stuck and I want to see its output.
> For each job reply on one line:
> '<A or B>: skill=<skill name you load> first-command=<the command family you would use>'.

## Observed result (num_turns 5, is_error false)

```
A: skill=orca-cli       first-command=`ORCA skills get orca-cli` (then the `ORCA worktree` family)
B: skill=firstmate-orca first-command=`bin/fm-peek.sh fm-1234`
```

Direct Orca worktree work routed to `orca-cli` and to the version-matched guide.
The Firstmate-supervised task routed to `firstmate-orca` and to a Firstmate
lifecycle helper, not to a raw `orca` command.

Limitation: this is one observation of model behavior, not a deterministic
assertion. It is supporting evidence that the routing boundary is deliverable
and usable, not a guarantee for every future session.
