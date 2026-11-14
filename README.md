# shed_inventory

An inventory for the shed, run from an old phone mounted inside the door. You
tap one big button and speak: *"Where's the cordless drill?"*, *"I'm taking
three lightbulbs"*, *"Returning the drill"*. The kiosk answers and updates the
count, and every change gets an Undo.

**Where it stands:** the infrastructure is real, and the interface is a
mockup. The page runs on a sample inventory held in memory. The mic records
nothing: each tap "hears" the next line of a script, so the whole flow can be
tried on the phone. The backend has a single health route. Real voice, real
data and the kiosk's sign-in come next (see [What comes next](#what-comes-next)).

## Trying the mockup

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5173. The dev server also listens on your network, so
the phone can open `http://<laptop-ip>:5173` over Wi-Fi.

Use **Try a sample** to run the scripted requests, or **Browse items** to search
and adjust the sample inventory. Each change offers Undo for ten seconds. API
connectivity is shown separately from the sample-data disclosure.

**Pause motion** stops the decorative background and remembers the setting on
that browser. Device reduced-motion preferences also stop animation; hidden
tabs and the idle screen pause the background automatically.

## Layout

```
site/                        the kiosk page; Vite builds it into dist/
  index.html
  src/
    main.jsx                 boot
    App.jsx                  the kiosk: mic, answer, Undo, search, screensaver
    styles.css               dark, large, for arm's length in a dim shed
    core/
      inventory.js           items, and changes as records that can be undone
      config.js              /config.json, which the deploy writes; none = sample mode
      api.js                 calls to the backend (the health check so far)
    kiosk/                   the sample button, answer card, browse dialog,
                               ambient background, screensaver, status line
    mock/
      sampleInventory.js     a made-up shed, and the mic's script
      assistant.js           stands in for the voice route, in its shape
backend/                     the API: one Lambda behind an HTTP API
  src/handler.js             routes; only GET /health so far
  esbuild.config.js          bundles to dist/handler.mjs for nodejs24.x
  esbuild.config.test.js     holds the bundle target, the runtime and .nvmrc together
scripts/                     shared with the other spokes, with their tests:
  amplify-publish.sh           publish dist/ through Amplify's manual-deploy API
  main-head-check.sh           apply only if this run is for main's head
  check-lockfiles.js           every lock entry has an integrity and a registry URL
  csp-compare.sh               the served CSP against the one Terraform built
  gitignore.test.js            .env.local and .env.<mode>.local stay out of git
modules/aws/
  amplify/                   the app and its headers (CSP, Permissions-Policy)
  dynamodb/                  the inventory table (point-in-time recovery, prevent_destroy)
  lambda/                    the function, its role and log group
  apigateway/                the HTTP API, its access log and throttle
versions.tf                  Terraform and provider pins, S3 backend
.terraform.lock.hcl          provider versions and hashes
providers.tf                 AWS, with the default tags
variables.tf                 inputs: description, type, validation
terraform.tfvars             the inputs' values, none secret
data.tf                      origins and tags
aws_*.tf                     one module call each
outputs.tf                   what CI and a person read back
.github/workflows/deploy.yml build, scan, plan; on main, apply and ship
.github/dependabot.yml       actions, npm (root and backend), Terraform
.checkov.yml                 the IaC scan's configuration
CLAUDE.md                    guidance for Claude Code
```

## Deploying

`.github/workflows/deploy.yml` runs only when dispatched (Actions → Deploy →
Run workflow). On any branch it builds and tests the site and the backend,
scans the Terraform and the workflow with Checkov, and writes the plan to the
run's summary. On `main` it then applies, uploads the Lambda bundle, writes
`config.json` with the API's URL, publishes the site to Amplify, and checks the
health route and the served CSP.

### First-time setup (once, by hand)

1. **Register the repository in `jerryaswell/terraform_infrastructure`**: an
   entry in `repos` in its `terraform.tfvars`, with
   `administrator_access = true` for this repository's first apply. Merge and
   apply it there, which creates `gha-shed_inventory`, `-plan` and `-preview`.
2. **In this repository's settings**, add the repository variable
   `AWS_ACCOUNT_ID`, and create the environment `aws-infra`, limited to the
   `main` branch.
3. **Dispatch Deploy on `main`.** The first apply creates the app, the table,
   the function and the API, and ships the site.
4. **Narrow the role:** in `terraform_infrastructure`, record the app id
   (`terraform output amplify_app_id`) on the entry and replace
   `administrator_access` with a policy for what this repository manages.
5. **Pin the CSP:** set `api_origin_override` in `terraform.tfvars` to
   `terraform output -raw api_url`, and deploy again.

The site is then at `terraform output site_url`.

`backend_reserved_concurrency` is explicit in `terraform.tfvars`. It is `-1`
while the account cannot reserve capacity for this function without consuming
its required unreserved pool. The function shares the account's capacity and
has no individual concurrency cap; other functions can contend for that pool.
The HTTP API still throttles at 5 requests per second with a burst of 10.
The plan job reports available Lambda capacity. Once a reservation fits, set
a positive whole number to reserve and cap this function; zero is refused
because it disables the API.

## The phone

A Galaxy Note 10 running **Fully Kiosk Browser** (Play Store; the kiosk
features need its one-time Plus licence). It is set up entirely on the phone:

- Start URL: the site URL. Turn on start on boot, keep screen on while
  charging, kiosk mode with a PIN, and reload when the network reconnects.
- Web content settings: allow the microphone, for when voice is real.
- Android: turn off battery optimisation for Fully, turn on **Protect
  battery** (stops charging at 85%), and set a weekly auto restart.

The page goes almost black after a minute and a half untouched, with a dim
clock that moves, because the OLED screen burns in a static image. Check
smoothness, heat, battery use and Android text scaling on the actual phone
before leaving the animated background running for long periods.

## What comes next

1. **Test the phone's microphone first.** Fully Kiosk shows pages in Android's
   WebView, which has no built-in speech recognition, so speech-to-text
   runs on the server. Test that recording and playback work in Fully on the
   Note 10 before building the voice route.
2. **The kiosk's sign-in.** An authorizer in front of every data route, and a
   long-lived credential for the kiosk that reaches this inventory and
   nothing else.
3. **The inventory routes**, over the records in `site/src/core/inventory.js`.
4. **The voice route.** Upload the audio, convert it to text, and send the
   text and the inventory to a language model. The model picks an item and an
   action from the list, in the shape `site/src/mock/assistant.js` answers in.
   The backend checks the pick and applies it. The model's API key goes in
   Secrets Manager, readable by the function alone.

## Local checks

What the `build` and `build-backend` jobs run:

```bash
npm run lint && npm test && npm run test:scripts
```

```bash
cd backend && npm test
```

```bash
terraform fmt -check -recursive && terraform init -backend=false && terraform validate
```
