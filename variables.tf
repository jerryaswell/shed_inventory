# Each input's description, type and validation. The values are in
# terraform.tfvars, committed so that a plan shows them
# (jerryaswell/terraform_infrastructure#119, C12). No input has a default.

variable "aws_region" {
  description = "Region for every resource."
  type        = string
}

variable "github_org" {
  description = "GitHub owner of this repository, for the Repo tag on every resource."
  type        = string
}

variable "amplify_app_name" {
  description = "The Amplify app's name."
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

variable "backend_reserved_concurrency" {
  description = "Maximum concurrent Lambda executions when positive; -1 uses the account's shared pool without a function-specific cap. Zero would disable the API and is refused."
  type        = number

  validation {
    condition     = var.backend_reserved_concurrency == -1 || (var.backend_reserved_concurrency >= 1 && floor(var.backend_reserved_concurrency) == var.backend_reserved_concurrency)
    error_message = "Use -1 for the shared pool, or a positive whole number for reserved concurrency."
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
