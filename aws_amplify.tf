module "site" {
  source = "./modules/aws/amplify"

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  app_name              = var.amplify_app_name
  branch_name           = var.amplify_branch_name
  allowed_country_codes = var.allowed_country_codes

  # The origin the CSP lets the page call. Built from variables, not read from
  # module.api, which already depends on this module through its CORS list.
  # Until api_origin_override is set it is a wildcard host, pinned to API
  # Gateway in this region.
  api_origin = var.api_origin_override != "" ? var.api_origin_override : "https://*.execute-api.${var.aws_region}.amazonaws.com"
}
