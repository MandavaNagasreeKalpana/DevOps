# Optional monitoring stack, reusing the configs in ../../monitoring.
# Files are uploaded into the containers, so no host bind mounts are needed.

locals {
  mon = var.enable_monitoring ? 1 : 0
}

resource "docker_image" "prometheus" {
  count        = local.mon
  name         = "prom/prometheus:v3.5.0"
  keep_locally = true
}

resource "docker_image" "grafana" {
  count        = local.mon
  name         = "grafana/grafana:12.1.0"
  keep_locally = true
}

resource "docker_image" "blackbox" {
  count        = local.mon
  name         = "prom/blackbox-exporter:v0.27.0"
  keep_locally = true
}

resource "docker_image" "nginx_exporter" {
  count        = local.mon
  name         = "nginx/nginx-prometheus-exporter:1.4.2"
  keep_locally = true
}

resource "docker_container" "nginx_exporter" {
  count   = local.mon
  name    = "${local.prefix}-nginx-exporter"
  image   = docker_image.nginx_exporter[0].image_id
  restart = "unless-stopped"
  command = ["--nginx.scrape-uri=http://web:8081/stub_status"]

  networks_advanced {
    name    = docker_network.this.id
    aliases = ["nginx-exporter"]
  }

  depends_on = [docker_container.lb]
}

resource "docker_container" "blackbox" {
  count   = local.mon
  name    = "${local.prefix}-blackbox"
  image   = docker_image.blackbox[0].image_id
  restart = "unless-stopped"
  command = ["--config.file=/etc/blackbox/blackbox.yml"]

  networks_advanced {
    name    = docker_network.this.id
    aliases = ["blackbox"]
  }

  upload {
    file    = "/etc/blackbox/blackbox.yml"
    content = file("${local.monitoring_src}/blackbox/blackbox.yml")
  }
}

resource "docker_volume" "prometheus" {
  count = local.mon
  name  = "${local.prefix}-prometheus-data"
}

resource "docker_container" "prometheus" {
  count   = local.mon
  name    = "${local.prefix}-prometheus"
  image   = docker_image.prometheus[0].image_id
  restart = "unless-stopped"
  command = [
    "--config.file=/etc/prometheus/prometheus.yml",
    "--storage.tsdb.path=/prometheus",
    "--storage.tsdb.retention.time=7d",
  ]

  ports {
    internal = 9090
    external = 9091
    ip       = "127.0.0.1"
  }

  networks_advanced {
    name    = docker_network.this.id
    aliases = ["prometheus"]
  }

  volumes {
    volume_name    = docker_volume.prometheus[0].name
    container_path = "/prometheus"
  }

  upload {
    file    = "/etc/prometheus/prometheus.yml"
    content = file("${local.monitoring_src}/prometheus/prometheus.yml")
  }

  upload {
    file    = "/etc/prometheus/alerts.yml"
    content = file("${local.monitoring_src}/prometheus/alerts.yml")
  }

  depends_on = [docker_container.nginx_exporter, docker_container.blackbox]
}

resource "docker_container" "grafana" {
  count   = local.mon
  name    = "${local.prefix}-grafana"
  image   = docker_image.grafana[0].image_id
  restart = "unless-stopped"

  env = [
    "GF_SECURITY_ADMIN_USER=admin",
    "GF_SECURITY_ADMIN_PASSWORD=${var.grafana_admin_password}",
    "GF_USERS_ALLOW_SIGN_UP=false",
    "GF_ANALYTICS_REPORTING_ENABLED=false",
    "GF_ANALYTICS_CHECK_FOR_UPDATES=false",
  ]

  ports {
    internal = 3000
    external = 3001
    ip       = "127.0.0.1"
  }

  networks_advanced {
    name = docker_network.this.id
  }

  upload {
    file    = "/etc/grafana/provisioning/datasources/prometheus.yml"
    content = file("${local.monitoring_src}/grafana/provisioning/datasources/prometheus.yml")
  }

  upload {
    file    = "/etc/grafana/provisioning/dashboards/dashboards.yml"
    content = file("${local.monitoring_src}/grafana/provisioning/dashboards/dashboards.yml")
  }

  upload {
    file    = "/var/lib/grafana/dashboards/secure-file-share.json"
    content = file("${local.monitoring_src}/grafana/dashboards/secure-file-share.json")
  }

  depends_on = [docker_container.prometheus]
}
