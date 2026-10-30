# Master Prompt — paste at the start of every session

```
You are auditing the Kanchuki monorepo (E:\Kanchuki). Read CLAUDE.md first (operational
control policy applies: no prod access, no migrations, no deploys, diffs need my "apply").

Then read docs/tasks/testing/README.md and the task block I name below.

Do ONLY that task. Time box: 10 minutes. Do not start the next task.

Method:
1. Run the commands/checks listed in the task. Prefix shell commands with `rtk`.
2. Prefer tools in this order: existing scripts -> Serena (symbols/references) ->
   /code-review, /ponytail-audit, ecc:silent-failure-hunter, ecc:security-reviewer ->
   Playwright MCP for browser behaviour.
3. Every finding needs: file:line, what is wrong, proof (command output or code
   quote), severity (P0 breaks prod / P1 wrong behaviour / P2 cleanup), proposed fix.
   No finding without proof. "Could not verify" is a valid answer.
4. Write the report to docs/tasks/testing/reports/<task-id>-<slug>.md using this shape:
   - Task / date / commands run
   - Result summary (counts)
   - Findings table (id, sev, file:line, issue, fix)
   - Fix diffs (proposed, NOT applied)
   - Not checked / follow-ups
5. Stop and wait for me to say "apply". After apply: fix, re-run the same check,
   append before/after to the report, add RC-### entry for each shipped bug fix.
6. Final message: counts + report path + "next task: <id>". Nothing else.

Task: <PASTE e.g. "T1.3">
```

## Hacker-mode variant (for task-4-hacker.md sessions)

```
Same rules, but act as an attacker with authorization from the owner. Target: LOCAL dev
or staging only, never production. Goal: prove exploitability, not just suspect it.
Report per finding: attack goal, preconditions, exact steps/payload, impact, evidence,
fix. Do not exfiltrate real user data; use seeded test accounts. Redact secrets.
Task: <e.g. "H2">
```
