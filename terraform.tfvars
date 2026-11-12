# This configuration's inputs. Each one's description, type and validation are
# in variables.tf. Nothing here is a secret.

aws_region          = "us-east-2"
github_org          = "jerryaswell"
amplify_app_name    = "shed-inventory"
amplify_branch_name = "main"
backend_name        = "shed-inventory"

allowed_country_codes = ["US"]

# The dev server reaches the deployed API. Turn off to close CORS to localhost.
allow_localhost_origin = true

# Empty until the first apply has created the API. Then set it to
# `terraform output -raw api_url`, so the CSP names that one host rather than
# every API Gateway in the region.
api_origin_override = ""
