# This configuration's inputs. Each one's description, type and validation are
# in variables.tf. Nothing here is a secret.

aws_region          = "us-east-2"
github_org          = "jerryaswell"
amplify_app_name    = "shed-inventory"
amplify_branch_name = "main"
backend_name        = "shed-inventory"

# The first apply could not reserve five executions while preserving the
# account's required unreserved pool. The API throttle remains 5 requests/s,
# burst 10; this function shares account capacity until a reservation fits.
backend_reserved_concurrency = -1

# The dev server reaches the deployed API. Turn off to close CORS to localhost.
allow_localhost_origin = true

# The exact API created by the first apply; the CSP admits only this host.
api_origin_override = "https://98jwo8ikz2.execute-api.us-east-2.amazonaws.com"
