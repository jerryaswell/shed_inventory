terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.62"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }

  # The state bucket and the OIDC roles this repository's CI assumes are made
  # by jerryaswell/terraform_infrastructure, where this repository is an entry
  # in `repos`. The backend works from the first `terraform init`; there is no
  # local-state bootstrap.
  backend "s3" {
    bucket       = "jerryaswell-terraform-state"
    key          = "shed_inventory/terraform.tfstate"
    region       = "us-east-2"
    encrypt      = true
    use_lockfile = true
  }
}
