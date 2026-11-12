variable "api_name" {
  description = "The HTTP API's name, and the base of its access log group's name."
  type        = string
}

variable "lambda_invoke_arn" {
  description = "The function the API invokes."
  type        = string
}

variable "lambda_function_name" {
  description = "The function's name, for the permission that lets the API invoke it."
  type        = string
}

variable "allow_origins" {
  description = "Origins CORS admits: the site, and the dev server when allowed."
  type        = list(string)
}
