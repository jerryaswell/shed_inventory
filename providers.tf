provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.default_tags
  }
}

# A CLOUDFRONT-scope WAF web ACL, which Amplify's firewall integration needs,
# is created in us-east-1 whatever the app's region.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = local.default_tags
  }
}
