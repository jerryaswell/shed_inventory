output "function_name" {
  description = "The function's name."
  value       = aws_lambda_function.this.function_name
}

output "invoke_arn" {
  description = "The ARN API Gateway invokes."
  value       = aws_lambda_function.this.invoke_arn
}
