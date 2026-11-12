variable "app_name" {
  description = "The Amplify app's name, and the base of the web ACL's and its log group's names."
  type        = string
}

variable "branch_name" {
  description = "The production branch the site is published to."
  type        = string
}

variable "allowed_country_codes" {
  description = "ISO 3166-1 alpha-2 codes of the countries allowed to reach the site."
  type        = list(string)
}

variable "api_origin" {
  description = "The origin the page may call for data, as a CSP source. See api_origin_override at the root for why it is passed in."
  type        = string
}
