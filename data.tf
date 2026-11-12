locals {
  # The site's public origin. The API's CORS list reads it.
  site_origin = module.site.branch_url

  # The Vite dev server, when var.allow_localhost_origin admits it.
  dev_origins = var.allow_localhost_origin ? ["http://localhost:5173"] : []
  app_origins = concat([local.site_origin], local.dev_origins)

  # Every resource's tags, through default_tags on both providers.
  default_tags = {
    ManagedBy = "terraform"
    Repo      = "${var.github_org}/shed_inventory"
  }
}
