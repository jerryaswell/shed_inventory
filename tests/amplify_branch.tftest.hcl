# The deploy publishes to output.amplify_branch_name, so it must be the
# configured hosting branch, whatever that is, and not a literal main (#24).
mock_provider "aws" {}
mock_provider "archive" {}

run "branch_output_follows_the_input" {
  command = plan
  variables {
    amplify_branch_name = "production"
  }

  assert {
    condition     = output.amplify_branch_name == "production"
    error_message = "amplify_branch_name output does not follow the input the deploy publishes to."
  }
}
