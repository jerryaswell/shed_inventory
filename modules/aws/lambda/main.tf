# The API's one function. Terraform creates it with a placeholder bundle; the
# deploy uploads the real one (backend/) with update-function-code, so code
# changes never go through a plan. ignore_changes below keeps Terraform from
# putting the placeholder back.

data "archive_file" "placeholder" {
  type        = "zip"
  output_path = "${path.module}/placeholder.zip"

  source {
    content  = "export const handler = async () => ({ statusCode: 503, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'backend not yet deployed' }) });"
    filename = "handler.mjs"
  }
}

resource "aws_iam_role" "exec" {
  name = "${var.function_name}-exec"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# Its own log group and its own table, and nothing else. The table grant is
# here ahead of the routes that will use it, so adding them is a code change
# only.
resource "aws_iam_role_policy" "exec" {
  name = "${var.function_name}-policy"
  role = aws_iam_role.exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "Logs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.this.arn}:*"
      },
      {
        Sid    = "TableCrud"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:BatchWriteItem",
          "dynamodb:ConditionCheckItem"
        ]
        Resource = var.table_arn
      }
    ]
  })
}

resource "aws_cloudwatch_log_group" "this" {
  #checkov:skip=CKV_AWS_158:AWS-owned-key encryption at rest is sufficient for operational logs that hold no credentials; a CMK is cost and key-policy risk for no gain here.
  name              = "/aws/lambda/${var.function_name}"
  retention_in_days = 365
}

resource "aws_lambda_function" "this" {
  #checkov:skip=CKV_AWS_117:The function reaches DynamoDB over the public AWS API and nothing private. A VPC would add a NAT gateway or endpoints for no gain.
  #checkov:skip=CKV_AWS_272:Code signing needs an AWS Signer profile and a signing step in CI. The bundle ships from the run that built and tested it, by artifact id with its digest checked.
  #checkov:skip=CKV_AWS_173:The environment holds only the table's name, which is not a secret.
  #checkov:skip=CKV_AWS_116:API Gateway invokes the function synchronously and gets the error back; a dead-letter queue only receives failed asynchronous invocations, and there are none.
  #checkov:skip=CKV_AWS_50:X-Ray tracing is not worth its cost for one function with no downstream calls yet. Revisit when the voice route calls out to speech and language APIs.
  function_name = var.function_name
  role          = aws_iam_role.exec.arn
  # The Node major moves with backend/esbuild.config.js's target, in its own
  # change.
  runtime       = "nodejs24.x"
  architectures = ["arm64"]
  handler       = "handler.handler"

  filename         = data.archive_file.placeholder.output_path
  source_code_hash = data.archive_file.placeholder.output_base64sha256

  # Room for the voice route to come: a speech-to-text call and a language
  # model call in series. The HTTP API gives up at 30 seconds whatever this says.
  timeout     = 29
  memory_size = 512

  #checkov:skip=CKV_AWS_115:The account cannot reserve five executions while retaining its required unreserved pool. -1 shares the existing account capacity; the HTTP API keeps its 5 requests/s and burst-10 throttle. Set a positive root input when capacity permits a function-specific cap.
  # Positive values cap this function; -1 shares the account's remaining pool.
  reserved_concurrent_executions = var.reserved_concurrency

  environment {
    variables = {
      TABLE_NAME   = var.table_name
      NODE_OPTIONS = "--enable-source-maps"
    }
  }

  depends_on = [aws_cloudwatch_log_group.this, aws_iam_role_policy.exec]

  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }
}
