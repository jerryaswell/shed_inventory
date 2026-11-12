# An HTTP API in front of the function.
#
# Today it has one route, GET /health, and that route takes no credentials: it
# says the backend is up and nothing else, and the function answers every
# other path with a 404 without touching the table. The inventory routes come
# with the kiosk's sign-in, behind an authorizer; no data route is ever added
# here without one.
resource "aws_apigatewayv2_api" "this" {
  name          = var.api_name
  description   = "API for the shed inventory."
  protocol_type = "HTTP"

  # API Gateway answers preflight itself, so the function sends no CORS
  # headers. This block is the one place the allowed origins are stated.
  cors_configuration {
    allow_origins = var.allow_origins
    allow_methods = ["GET", "OPTIONS"]
    allow_headers = ["authorization", "content-type"]
    max_age       = 3600
  }
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.this.id
  integration_type       = "AWS_PROXY"
  integration_uri        = var.lambda_invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "health" {
  #checkov:skip=CKV_AWS_309:A liveness check that reads nothing and returns nothing but {"ok":true}. Every data route will have an authorizer.
  api_id    = aws_apigatewayv2_api.this.id
  route_key = "GET /health"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

# The execution ARN carries no stage or route, so the wildcards cover every
# stage, method and path under this API and no other.
resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/*/*"
}

resource "aws_cloudwatch_log_group" "access" {
  #checkov:skip=CKV_AWS_158:AWS-owned-key encryption at rest is sufficient for access logs; a CMK is cost and key-policy risk for no gain here.
  name              = "/aws/apigateway/${var.api_name}"
  retention_in_days = 365
}

# `$default`, so the invoke URL has no stage segment, and auto_deploy, so a
# route change is live on apply.
resource "aws_apigatewayv2_stage" "this" {
  api_id      = aws_apigatewayv2_api.this.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.access.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      time           = "$context.requestTime"
      method         = "$context.httpMethod"
      path           = "$context.path"
      status         = "$context.status"
      latency        = "$context.responseLatency"
      integrationErr = "$context.integration.error"
      sourceIp       = "$context.identity.sourceIp"
    })
  }

  # The rate guard in front of the function, with its concurrency cap behind.
  default_route_settings {
    throttling_rate_limit  = 5
    throttling_burst_limit = 10
  }
}
