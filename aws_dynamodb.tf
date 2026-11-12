module "data" {
  source = "./modules/aws/dynamodb"

  table_name = var.backend_name
}
