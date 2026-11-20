# Isocore Broadcast: owner-approved changes

**Live deployment remains on the existing GitHub/Wrangler workflow.** These instructions do not create a second deployment path.

1. Investigate without changing production.
2. Put proposed changes on a dedicated branch, not `main`.
3. Open a pull request describing scope, test evidence, risk, and rollback.
4. Owner explicitly approves the merge before any change reaches `main`.
5. Use existing deployment; check live service after the approved merge.

Never commit Cloudflare API tokens, Twitch/Discord credentials, CONTROL_TOKEN, session keys, personal data, or database exports. Request separate approval for auth changes, D1 migrations, secret rotation, DNS/routing changes, destructive operations, or AI services spending.

## Important limitation

This policy and PR validation workflow do not by themselves prevent direct pushes to `main`. To enforce approval on this public repository, the owner should configure a GitHub ruleset requiring pull requests, with force-pushes and branch deletion blocked, and enable the validation check as a required status check after its first successful run. There are currently no repository rulesets. The connected ChatGPT GitHub app cannot administer branch protection.

The existing `install-isocore.yml` can push extracted ZIP changes straight to `main` under some conditions. It is deliberately left unchanged in this proposal because it may be part of an existing workflow created with another assistant. Review it before enabling enforcement.

**Do not treat a passing PR check as confirmation that Cloudflare has deployed successfully.**
