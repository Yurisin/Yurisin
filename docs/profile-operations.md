# Profile analytics operations

The profile works without private analytics. Until a dedicated credential exists, the workflow exits successfully after validation, retains the last valid SVGs, and the READMEs keep local analytics cards hidden.

## Dedicated credential

Use only a credential created specifically for aggregate profile analytics. Do not reuse a GitHub CLI login token. Grant read-only access to the account and repositories needed to calculate the approved aggregates; do not grant administration, workflow, package, deletion, or write permissions.

Set the secret through an interactive prompt so its value does not enter shell history or chat:

```bash
gh secret set PROFILE_STATS_TOKEN --repo Yurisin/Yurisin
```

Only the name `PROFILE_STATS_TOKEN` is documented. Never store its value in a file, command argument, log, issue, commit, or README.

## First activation

1. Configure the dedicated secret interactively.
2. Run **Update profile analytics** with `workflow_dispatch`.
3. Inspect the run logs for validation success and absence of repository names or raw API responses.
4. Inspect `profile/stats.svg` and `profile/top-langs.svg` as text.
5. After the first valid pair exists, add the two local image references to both READMEs and run the complete validation suite before publishing that change.

## Routine operation

The workflow runs every Monday at 06:17 UTC and may also be started manually. It validates the profile before generation, writes both SVG candidates in isolation, validates the complete pair, and commits only changed SVG files. A failed API request, authentication error, malformed response, or unsafe SVG leaves the prior pair unchanged.

## Rotation and revocation

- Create the replacement credential before revoking the old one.
- Replace the secret through the same interactive `gh secret set` command.
- Trigger a manual run and inspect it before revoking the prior credential.
- Revoke the credential immediately if logs or access records suggest exposure.

To remove the secret:

```bash
gh secret delete PROFILE_STATS_TOKEN --repo Yurisin/Yurisin
```

The profile remains usable; analytics updates are skipped and the last valid SVGs remain.

## Disable or recover

- Disable the schedule by editing the workflow and removing only the `schedule` trigger; retain `workflow_dispatch` for controlled recovery.
- Diagnose failures from the first failing validation or API step. Logs intentionally omit raw responses and credentials.
- Restore a known-good artifact with a normal follow-up commit. Never use force-push, destructive reset, or history rewriting for recovery.
- If no valid SVG pair has ever been generated, keep local analytics images absent from both READMEs.

