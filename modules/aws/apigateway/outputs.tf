output "api_url" {
  description = "The invoke URL of the $default stage, with no trailing slash."
  value       = trimsuffix(aws_apigatewayv2_stage.this.invoke_url, "/")
}
