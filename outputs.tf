# What CI and a person read back. The deploy reads amplify_app_id,
# backend_lambda_function_name and api_url; site_url and site_csp are for the
# check that the site serves its headers.

output "amplify_app_id" {
  description = "The Amplify app's id. The deploy publishes the site to it."
  value       = module.site.app_id
}

output "site_url" {
  description = "Where the site is served."
  value       = local.site_origin
}

output "site_csp" {
  description = "The Content-Security-Policy the site should serve. The deploy compares the served header with it."
  value       = module.site.csp
}

output "api_url" {
  description = "The HTTP API's invoke URL, with no trailing slash. The deploy writes it into config.json; it is also the value for api_origin_override."
  value       = module.api.api_url
}

output "backend_lambda_function_name" {
  description = "The function the deploy uploads the backend bundle to."
  value       = module.api_fn.function_name
}

output "data_table_name" {
  description = "The inventory table."
  value       = module.data.table_name
}
