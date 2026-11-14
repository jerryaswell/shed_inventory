module "api_fn" {
  source = "./modules/aws/lambda"

  function_name        = "${var.backend_name}-api"
  table_name           = module.data.table_name
  table_arn            = module.data.table_arn
  reserved_concurrency = var.backend_reserved_concurrency
}
