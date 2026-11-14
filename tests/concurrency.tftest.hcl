# A disabled function or a fractional reservation must fail before AWS sees it.
mock_provider "aws" {}
mock_provider "archive" {}

run "shared_pool_is_valid" {
  command = plan
}

run "zero_cannot_disable_the_api" {
  command = plan
  variables {
    backend_reserved_concurrency = 0
  }
  expect_failures = [var.backend_reserved_concurrency]
}

run "fractional_capacity_is_invalid" {
  command = plan
  variables {
    backend_reserved_concurrency = 1.5
  }
  expect_failures = [var.backend_reserved_concurrency]
}

run "other_negative_capacity_is_invalid" {
  command = plan
  variables {
    backend_reserved_concurrency = -2
  }
  expect_failures = [var.backend_reserved_concurrency]
}
