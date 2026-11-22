variable "docker_host" {
  description = "Docker daemon to manage. The default works on Linux, macOS and Docker Desktop (including from inside the terraform container)."
  type        = string
  default     = "unix:///var/run/docker.sock"
}

variable "environment" {
  description = "Name of the environment; used as a prefix for every resource."
  type        = string
  default     = "staging"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,20}$", var.environment))
    error_message = "environment must be lowercase letters, digits or dashes (2-21 characters)."
  }
}

variable "app_image" {
  description = "App image to run. Build it first with: docker compose --env-file .env.local build"
  type        = string
  default     = "secure-file-share:local"
}

variable "app_replicas" {
  description = "Number of app containers behind the load balancer."
  type        = number
  default     = 2

  validation {
    condition     = var.app_replicas >= 1 && var.app_replicas <= 5
    error_message = "app_replicas must be between 1 and 5."
  }
}

variable "public_port" {
  description = "Host port for the load balancer."
  type        = number
  default     = 8088
}

variable "enable_monitoring" {
  description = "Also run Prometheus, Grafana and the exporters."
  type        = bool
  default     = true
}

variable "grafana_admin_password" {
  description = "Grafana admin password."
  type        = string
  default     = "admin"
  sensitive   = true
}
