output "table_name" {
  description = "The table's name, for the function's TABLE_NAME."
  value       = aws_dynamodb_table.this.name
}

output "table_arn" {
  description = "The table's ARN, which scopes the function's grant."
  value       = aws_dynamodb_table.this.arn
}
