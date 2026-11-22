locals {
  prefix         = var.environment
  monitoring_src = "${path.module}/../../monitoring"
  labels = {
    "app.part-of"     = "secure-file-share"
    "app.environment" = var.environment
    "app.managed-by"  = "terraform"
  }
}

# ---------------------------------------------------------------- network

resource "docker_network" "this" {
  name = "${local.prefix}-net"

  dynamic "labels" {
    for_each = local.labels
    content {
      label = labels.key
      value = labels.value
    }
  }
}

# ---------------------------------------------------------------- app

# The app image is built locally (or in CI), not pulled from a registry.
data "docker_image" "app" {
  name = var.app_image
}

resource "docker_container" "web" {
  count = var.app_replicas

  name    = "${local.prefix}-web-${count.index}"
  image   = data.docker_image.app.id
  restart = "unless-stopped"

  networks_advanced {
    name    = docker_network.this.id
    aliases = ["app"]
  }

  healthcheck {
    test     = ["CMD", "wget", "-q", "--spider", "http://127.0.0.1/"]
    interval = "15s"
    timeout  = "3s"
    retries  = 3
  }

  dynamic "labels" {
    for_each = merge(local.labels, { "app.role" = "web", "app.replica" = tostring(count.index) })
    content {
      label = labels.key
      value = labels.value
    }
  }
}

# ---------------------------------------------------------------- load balancer

resource "docker_image" "nginx" {
  name         = "nginx:1.29-alpine"
  keep_locally = true
}

resource "docker_container" "lb" {
  name    = "${local.prefix}-lb"
  image   = docker_image.nginx.image_id
  restart = "unless-stopped"

  ports {
    internal = 80
    external = var.public_port
    ip       = "127.0.0.1"
  }

  networks_advanced {
    name = docker_network.this.id
    # Monitoring config refers to the app as http://web and web:8081.
    aliases = ["web"]
  }

  upload {
    file = "/etc/nginx/conf.d/default.conf"
    content = templatefile("${path.module}/templates/lb.conf.tftpl", {
      backends = docker_container.web[*].name
    })
  }

  dynamic "labels" {
    for_each = merge(local.labels, { "app.role" = "load-balancer" })
    content {
      label = labels.key
      value = labels.value
    }
  }
}
