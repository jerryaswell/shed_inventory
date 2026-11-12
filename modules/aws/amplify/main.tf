# Static hosting for the kiosk site.
#
# No web ACL, by the owner's decision on 2026-11-12, as for the other static
# sites (jerryaswell/self_mgmt#279): the page holds nothing but a bundle, and
# the API it calls is throttled at its own stage.
#
# Not connected to GitHub: Amplify's Git integration needs a stored GitHub
# token, which the account's no-long-lived-secrets rule forbids. The deploy
# publishes the built bundle through the manual-deploy API instead
# (scripts/amplify-publish.sh), with the gha-shed_inventory role.

locals {
  # The page's Content-Security-Policy. It calls its own origin (config.json)
  # and the API, and loads nothing from anywhere else. 'unsafe-inline' styles
  # are for React's style attributes, not for scripts. No markup is ever
  # written from a string, so Trusted Types allows no policy at all.
  csp = join("; ", [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self'",
    "connect-src 'self' ${var.api_origin}",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    "require-trusted-types-for 'script'",
    "trusted-types 'none'",
  ])

  # The microphone is the kiosk's input (tap to speak), and the camera is for
  # scanning bin labels later. Both are allowed for this origin only; nothing
  # else the page could ask for is.
  permissions_policy = "microphone=(self), camera=(self), geolocation=(), payment=(), usb=()"

  # Amplify stores this YAML and returns it as JSON, so every plan shows
  # custom_headers as changed even when it is not. The content is what counts.
  custom_headers_yaml = <<-EOT
    customHeaders:
      - pattern: '/**'
        headers:
          - key: 'Content-Security-Policy'
            value: "${local.csp}"
          - key: 'Permissions-Policy'
            value: '${local.permissions_policy}'
          - key: 'X-Content-Type-Options'
            value: 'nosniff'
          - key: 'Referrer-Policy'
            value: 'strict-origin-when-cross-origin'
          - key: 'Strict-Transport-Security'
            value: 'max-age=31536000; includeSubDomains'
      - pattern: '/index.html'
        headers:
          - key: 'Cache-Control'
            value: 'no-cache'
      - pattern: '/assets/**'
        headers:
          - key: 'Cache-Control'
            value: 'public, max-age=31536000, immutable'
      - pattern: '/config.json'
        headers:
          - key: 'Cache-Control'
            value: 'no-cache'
  EOT
}

resource "aws_amplify_app" "this" {
  name = var.app_name

  custom_headers = local.custom_headers_yaml
}

resource "aws_amplify_branch" "this" {
  app_id      = aws_amplify_app.this.id
  branch_name = var.branch_name
  stage       = "PRODUCTION"

  # Nothing to build from: CI publishes the bundle.
  enable_auto_build = false
}
