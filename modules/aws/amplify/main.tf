# Static hosting for the kiosk site, behind the account's standard firewall.
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

# The account's standard firewall for an Amplify app, as in self_mgmt,
# easy_floorplan_designer and framing_planner: a country allow-list and three
# AWS managed rule groups, logging only what it blocks or counts. A WAF log
# group's name must start with aws-waf-logs-, and a CLOUDFRONT-scope ACL logs
# into us-east-1.
resource "aws_wafv2_web_acl" "this" {
  provider = aws.us_east_1

  name        = "${var.app_name}-firewall"
  description = "Amplify-recommended firewall protection for ${var.app_name}."
  scope       = "CLOUDFRONT"

  default_action {
    allow {}
  }

  rule {
    name     = "geo-restrict-whitelist"
    priority = 0

    action {
      block {}
    }

    statement {
      not_statement {
        statement {
          geo_match_statement {
            country_codes = var.allowed_country_codes
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.app_name}-geo-restrict-whitelist"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWS-AWSManagedRulesAmazonIpReputationList"
    priority = 1

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesAmazonIpReputationList"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AWS-AWSManagedRulesAmazonIpReputationList"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWS-AWSManagedRulesCommonRuleSet"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesCommonRuleSet"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AWS-AWSManagedRulesCommonRuleSet"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWS-AWSManagedRulesKnownBadInputsRuleSet"
    priority = 3

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AWS-AWSManagedRulesKnownBadInputsRuleSet"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.app_name}-firewall"
    sampled_requests_enabled   = true
  }
}

resource "aws_cloudwatch_log_group" "waf" {
  #checkov:skip=CKV_AWS_158:AWS-owned-key encryption at rest is sufficient for request logs carrying no credentials (sensitive headers and the query string are redacted below); a CMK is cost and key-policy risk for no gain here.
  #checkov:skip=CKV_AWS_338:The one-year floor this check wants is deliberately not taken. A firewall record answers "what did the firewall stop", which is interesting for days; post-filter these are mostly turned-away scanners, and a shorter window is less redacted-but-request-shaped data to keep.
  provider = aws.us_east_1

  name              = "aws-waf-logs-${var.app_name}"
  retention_in_days = 90
}

resource "aws_wafv2_web_acl_logging_configuration" "this" {
  provider = aws.us_east_1

  resource_arn            = aws_wafv2_web_acl.this.arn
  log_destination_configs = [aws_cloudwatch_log_group.waf.arn]

  logging_filter {
    default_behavior = "DROP"

    filter {
      behavior    = "KEEP"
      requirement = "MEETS_ANY"

      condition {
        action_condition {
          action = "BLOCK"
        }
      }
      condition {
        action_condition {
          action = "COUNT"
        }
      }
      condition {
        action_condition {
          action = "CAPTCHA"
        }
      }
      condition {
        action_condition {
          action = "CHALLENGE"
        }
      }
    }
  }

  redacted_fields {
    single_header {
      name = "authorization"
    }
  }

  redacted_fields {
    single_header {
      name = "cookie"
    }
  }

  redacted_fields {
    single_header {
      name = "referer"
    }
  }

  redacted_fields {
    query_string {}
  }
}

resource "aws_wafv2_web_acl_association" "this" {
  provider = aws.us_east_1

  resource_arn = aws_amplify_app.this.arn
  web_acl_arn  = aws_wafv2_web_acl.this.arn
}
