variable "function_name" {
  description = "The function's name, and the base of its role's and log group's names."
  type        = string
}

variable "table_name" {
  description = "The inventory table, passed to the function as TABLE_NAME."
  type        = string
}

variable "table_arn" {
  description = "The inventory table's ARN, which scopes the function's grant."
  type        = string
}

variable "reserved_concurrency" {
  description = "Concurrent executions reserved for, and so the most allowed to, the function. -1 uses the shared account pool without a function-specific cap."
  type        = number
  default     = 5
}
