module "api" {
  source = "./modules/aws/apigateway"

  api_name             = "${var.backend_name}-api"
  lambda_invoke_arn    = module.api_fn.invoke_arn
  lambda_function_name = module.api_fn.function_name
  allow_origins        = local.app_origins
}
