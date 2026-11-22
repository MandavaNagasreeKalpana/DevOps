output "app_url" {
  description = "Load-balanced app URL."
  value       = "http://127.0.0.1:${var.public_port}"
}

output "app_containers" {
  description = "App containers behind the load balancer."
  value       = docker_container.web[*].name
}

output "prometheus_url" {
  value = var.enable_monitoring ? "http://127.0.0.1:9091" : null
}

output "grafana_url" {
  value = var.enable_monitoring ? "http://127.0.0.1:3001" : null
}
