variable "app_name" {
  description = "The Amplify app's name."
  type        = string
}

variable "branch_name" {
  description = "The production branch the site is published to."
  type        = string
}

variable "api_origin" {
  description = "The origin the page may call for data, as a CSP source. See api_origin_override at the root for why it is passed in."
  type        = string
}
