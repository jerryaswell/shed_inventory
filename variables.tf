# Each input's description, type and validation. The values are in
# terraform.tfvars, committed so that a plan shows them
# (jerryaswell/terraform_infrastructure#119, C12). No input has a default.

variable "aws_region" {
  description = "Region for everything but the CLOUDFRONT-scope web ACL, which is always in us-east-1."
  type        = string
}

variable "github_org" {
  description = "GitHub owner of this repository, for the Repo tag on every resource."
  type        = string
}

variable "amplify_app_name" {
  description = "The Amplify app's name, and the base of the web ACL's and its log group's names."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,40}$", var.amplify_app_name))
    error_message = "Lowercase letters, digits and hyphens, starting with a letter, 3 to 41 characters."
  }
}

variable "amplify_branch_name" {
  description = "The Amplify production branch, which the deploy publishes the site to."
  type        = string
}

variable "backend_name" {
  description = "Base name of the backend's resources: the table, the function (<name>-api) and the HTTP API (<name>-api)."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,40}$", var.backend_name))
    error_message = "Lowercase letters, digits and hyphens, starting with a letter, 3 to 41 characters."
  }
}

variable "allowed_country_codes" {
  description = "ISO 3166-1 alpha-2 codes of the countries the web ACL lets reach the site. Every other country is blocked."
  type        = list(string)

  validation {
    condition     = length(var.allowed_country_codes) > 0 && alltrue([for c in var.allowed_country_codes : can(regex("^[A-Z]{2}$", c))])
    error_message = "At least one code, each two capital letters."
  }
}

variable "allow_localhost_origin" {
  description = "Whether the API's CORS list admits the Vite dev server (http://localhost:5173), so the site can run locally against the real backend."
  type        = bool
}

variable "api_origin_override" {
  description = <<-EOT
    The API's exact origin (https://<id>.execute-api.<region>.amazonaws.com),
    for the site's Content-Security-Policy. Empty until the first apply has
    created the API; the CSP then allows any API Gateway host in the region.

    It is an input rather than a read of module.api because the API's CORS
    list is built from the site's URL, so the site's module reading the API
    back would be a dependency cycle. After the first apply, set it to
    `terraform output -raw api_url`.
  EOT
  type        = string

  validation {
    condition     = var.api_origin_override == "" || can(regex("^https://[a-z0-9]+\\.execute-api\\.[a-z0-9-]+\\.amazonaws\\.com$", var.api_origin_override))
    error_message = "Empty, or https://<id>.execute-api.<region>.amazonaws.com with no path and no trailing slash."
  }
}
