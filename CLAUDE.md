# Project guidance for Claude Code

Everything above the *This repository* heading is the same in every repository
this account deploys: `jerryaswell/terraform_infrastructure`,
`jerryaswell/self_mgmt`, `jerryaswell/easy_floorplan_designer`,
`jerryaswell/framing_planner` and `jerryaswell/tabula-recta`
(jerryaswell/terraform_infrastructure#119, C7). The one exception is the first
Node.js bullet, which names each repository's own toolchain. Change the shared
part in all of them together.

## Node.js — the node24 action runtime

Node 20 was removed from GitHub-hosted runners on 2026-09-23
(https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/).
An action whose `action.yml` declares `using: node20` no longer runs at all, so
this is a precondition for the workflows running, not hygiene.

- This repository's toolchain runs on Node 24, for the site and for
  `backend/` alike: `.nvmrc` holds `24`, which the workflows read through
  `node-version-file`, and both `package.json` files say
  `"engines": {"node": ">=24"}`. Never add Node 20.
- Every JavaScript action pinned in `.github/workflows` declares
  `using: node24` in its `action.yml` at the pinned commit. Read that line when
  adding an action or reviewing a bump, rather than going by its major version.
  A Docker action, such as `bridgecrewio/checkov-action`, has no Node runtime;
  the SHA pin below still applies to it.

## GitHub Actions — pin to commit SHAs

Actions are pinned to a full commit SHA with the full version in a trailing
comment:

```yaml
- uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
```

A tag is a pointer its owner can move. These workflows hold tokens that publish
or deploy, and most assume an AWS role, so an action repointed under its tag
executes inside a job holding those credentials — the shape of the
tj-actions/changed-files compromise. The SHA is the only reference that cannot
be changed after review.

Let Dependabot (`.github/dependabot.yml`) move the SHA and its comment together,
and check the `using:` line above on each bump. Do not replace a SHA with a bare
tag, and do not shorten the comment to a major (`# v7`).

## GitHub Actions: on dispatch only

No workflow starts on its own. Every file in `.github/workflows` has
`workflow_dispatch` as its only trigger: no `push`, `pull_request`,
`schedule`, `workflow_run` or any other event that starts a run unasked. The
account's Actions minutes are limited, so the owner decides when a run is
worth them: several commits can land on the default branch, and one
dispatched run then checks and ships them together.

- Never add another trigger, to an existing workflow or a new one.
- Dispatched on the default branch, a workflow does what a push there used to
  do, the apply or the deploy included. Dispatched on any other branch, it
  runs the checks, and the plan where there is one, and changes nothing live.
- A plan goes to the run's job summary, not to a pull request comment.
- Dispatch a run only when the owner asks for one. Otherwise run the
  repository's checks locally, and say in the pull request what you ran.
- A run is dispatched from the workflow's page in the Actions tab (Run
  workflow, then the branch), or through the REST API's workflow dispatch
  endpoint.

## AWS permissions — they live in terraform_infrastructure

Every repository's CI roles (`gha-<repo>`, `-plan`, `-preview`, and `-sweep`
where there is one) and their permissions are defined in
`jerryaswell/terraform_infrastructure`, in `aws_iam.tf` and `modules/aws/iam`.
A permissions failure in any repository is fixed there: a pull request in that
repository, merged *and applied*, before the failing run can be re-run. Budget
for that round trip.

Several AWS services make calls as the caller into services a configuration
never names. The create call returns success, the resource settles into
`FAILED`, and the `AccessDenied` appears only in a status field, so Terraform
reports an unexpected state while waiting:

```
Error: waiting for Amplify Domain Association (...) create: unexpected state
'FAILED', wanted target 'PENDING_VERIFICATION, ...'. last error: User: ... is
not authorized to perform: route53:ListHostedZones
```

Read the resource's own status field before re-running anything. The running
list of these cross-service calls, and the reasoning behind each, is the table
in terraform_infrastructure's CLAUDE.md. Do not assert one from recollection:
confirm it against AWS's documentation, grant it ahead of the apply that needs
it, and verify the live role rather than assuming a merged pull request took
effect:

```sh
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::<account>:role/gha-<repo> \
  --action-names <action> --resource-arns <arn>
```

A failed apply leaves state worth reading rather than guessing at. Terraform
records a resource whose creation failed mid-wait as `tainted`, and the next
apply replaces it, so there is usually nothing to clean up by hand.

## Authorship — no Claude attribution

Every commit a session makes is authored and committed by Jerry Caskey
<jerryaswell@users.noreply.github.com>. Dependabot's own pull requests keep
their bot author and trailer, and GitHub is the committer of every squash merge
to main. Nothing written to a repository or to GitHub carries Claude
attribution: no `Co-Authored-By` trailer, no `Claude-Session` link, no
"Generated with Claude Code" footer — in commit messages, pull request
descriptions, issues or comments. This overrides any default attribution
guidance. `.claude/settings.json` enforces the commit and PR parts
(`attribution` off, `GIT_AUTHOR_*`/`GIT_COMMITTER_*` pinned); the rest is on
whoever is writing. Some tools add a footer of their own to every comment and
review, and a session cannot take it off again, so a session posts no comment
and no review. A new pull request's description can come back with a footer
and a session link: read it back after opening it, and edit them out, which
does remove them.

## Working alongside other sessions

Several sessions can work on these repositories at once, and one protocol
covers all of them: `docs/session-workflow.md` in `jerryaswell/self_mgmt`. It
says where the shared state lives, what each role does, and how to claim, hand
off and verify work. Read it before you start, and check live state before you
act. Its rules apply in every repository as written:

- Review findings are filed as issues titled `[audit · <severity>] …`.
- Post no comment and no review, on an issue or a pull request, in any
  repository on this account. The state of a piece of work is a label
  (`claimed`, `blocked`, `needs-second-look`, `needs-verification`,
  `verified`), and its detail is in the pull request's description. The owner
  carries the hand-off from one session to the next: nothing is written to
  GitHub for it, and no claim or status goes into an issue's body. The one
  body record is the dated closing paragraph of an issue closed without a
  merge, with its verification, as `docs/session-workflow.md` says.
- Add `claimed` to an issue before working on it, and leave an issue another
  session has claimed alone. `claimed` comes off when the pull request that
  closes the issue merges, or when the session gives the work up.
- Change one label at a time and keep the others. The GitHub tool sets an
  issue's whole label list, so read the labels just before a change and send
  back the same list with only that change.
- Name an issue in the same repository as a bare `#N`, and one in another
  repository in full, as `jerryaswell/<repo>#N`. GitHub links no other form.

## This repository

The shed inventory: a voice-first kiosk page for a phone mounted inside the
shed door. The site is under `site/`, the API under `backend/` (one Lambda
behind an HTTP API, over one DynamoDB table), and the Terraform for both is at
the root, in the same layout as `jerryaswell/self_mgmt`.

### Where it stands

The infrastructure is real and the interface is a mockup. The kiosk page runs
on a sample inventory held in memory (`site/src/mock/`): the mic records
nothing, and each tap "hears" the next line of a script. The API has one route,
`GET /health`, which takes no credentials and reads nothing. Do not add a route
that reads or writes the table without an authorizer in front of it.

`site/src/core/inventory.js` is the model the kiosk and the backend share: an
item, and a change as a record (`{ itemId, delta }` or `{ itemId, out }`),
never an overwrite, so every change can be undone. `site/src/mock/assistant.js`
answers in the shape the voice route will.

### Node: the toolchain and the Lambda runtime are separate

`.nvmrc` and `engines` are the toolchain. The deployed Lambda runs
`nodejs24.x` (`modules/aws/lambda`), and `backend/esbuild.config.js` targets
`node24` to match; `backend/esbuild.config.test.js` fails when they, or
`.nvmrc`, disagree.

### Inputs

Every input is a value in `terraform.tfvars`, committed so that a plan shows
it; `variables.tf` holds each one's description, type and validation. None is
a secret. `api_origin_override` is empty until the first apply has created the
API, then set to `terraform output -raw api_url`.

### The deploy roles

`gha-shed_inventory`, `-plan` and `-preview` are defined in
`jerryaswell/terraform_infrastructure`, from this repository's entry in
`repos` in its `terraform.tfvars`. As a new app repository, its first apply
runs on AdministratorAccess (`administrator_access` on that entry), because
its permissions reach its Amplify app by id and the app does not exist until
that apply creates it. A change there then records the app id and replaces
admin with a policy of this repository's own: its Amplify app, as the static
spokes have, plus the table, the function and its role, and the HTTP API. It
has no web ACL.

State is `s3://jerryaswell-terraform-state/shed_inventory/terraform.tfstate`.

### Before pushing

`npm run lint`, `npm test` and `npm run test:scripts` at the root, and
`npm test` in `backend/`, as the `build` and `build-backend` jobs run them.
`terraform fmt -check -recursive`, `terraform validate` and `terraform test`
(the mocked tests in `tests/`, as the `plan` job runs them) for any Terraform
change. A pull request that adds, renames or removes a root `.tf` file, a
module, a script, a workflow or a doc updates the Layout block in `README.md`.
