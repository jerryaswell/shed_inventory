# The inventory: one table, on-demand, so an idle shed costs only the bytes
# at rest. It is the only copy of the data, so it carries every guard that
# makes an accidental loss loud: point-in-time recovery, deletion protection,
# and prevent_destroy, which fails a plan that would replace it.
#
# Keys are generic (pk, sk) so items, locations and the change log share the
# table without a migration. Nothing writes to it yet.
resource "aws_dynamodb_table" "this" {
  #checkov:skip=CKV_AWS_119:AWS-owned-key encryption at rest is on by default. A customer-managed key adds a monthly charge and per-request KMS calls, and its deletion would destroy the only copy of the data, against a threat model where this account's own function is the only principal with access.
  name         = var.table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }
  attribute {
    name = "sk"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  deletion_protection_enabled = true

  lifecycle {
    prevent_destroy = true
  }
}
