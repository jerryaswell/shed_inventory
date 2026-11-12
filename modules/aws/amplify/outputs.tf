output "app_id" {
  description = "The Amplify app's id."
  value       = aws_amplify_app.this.id
}

output "branch_url" {
  description = "The production branch's amplifyapp.com URL."
  value       = "https://${aws_amplify_branch.this.branch_name}.${aws_amplify_app.this.default_domain}"
}

output "csp" {
  description = "The Content-Security-Policy written into custom_headers."
  value       = local.csp
}
