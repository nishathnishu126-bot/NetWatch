CREATE DATABASE IF NOT EXISTS netwatch_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE netwatch_db;

CREATE TABLE IF NOT EXISTS devices (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  device_name VARCHAR(100) NOT NULL,
  ip_address VARCHAR(45) NOT NULL,
  mac_address CHAR(17) NOT NULL,
  device_type ENUM('Router', 'Laptop', 'Desktop', 'Mobile', 'Server', 'IoT') NOT NULL,
  status ENUM('online', 'offline') NOT NULL DEFAULT 'online',
  last_active DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_devices_ip (ip_address),
  UNIQUE KEY uq_devices_mac (mac_address),
  KEY idx_devices_status (status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS network_traffic (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  device_id INT UNSIGNED NULL,
  upload_mb DECIMAL(10,2) NOT NULL,
  download_mb DECIMAL(10,2) NOT NULL,
  protocol ENUM('TCP', 'UDP', 'HTTP', 'HTTPS') NOT NULL,
  recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_traffic_recorded (recorded_at),
  KEY idx_traffic_device_recorded (device_id, recorded_at),
  CONSTRAINT fk_traffic_device FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS performance_metrics (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  download_mbps DECIMAL(8,2) NOT NULL,
  upload_mbps DECIMAL(8,2) NOT NULL,
  latency_ms DECIMAL(8,2) NOT NULL,
  packet_loss_percent DECIMAL(5,2) NOT NULL,
  recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_performance_recorded (recorded_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS activity_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  device_id INT UNSIGNED NULL,
  device_name VARCHAR(100) NOT NULL,
  ip_address VARCHAR(45) NOT NULL,
  description VARCHAR(500) NOT NULL,
  activity_type ENUM('device', 'traffic', 'performance', 'alert', 'system') NOT NULL DEFAULT 'system',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_activity_created (created_at),
  KEY idx_activity_type (activity_type),
  KEY idx_activity_device (device_id),
  CONSTRAINT fk_activity_device FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS alerts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  device_id INT UNSIGNED NULL,
  title VARCHAR(120) NOT NULL,
  description VARCHAR(500) NOT NULL,
  severity ENUM('low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'low',
  status ENUM('open', 'resolved') NOT NULL DEFAULT 'open',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_alert_status_created (status, created_at),
  KEY idx_alert_device (device_id),
  CONSTRAINT fk_alert_device FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE SET NULL
) ENGINE=InnoDB;

INSERT IGNORE INTO devices (id, device_name, ip_address, mac_address, device_type, status, last_active) VALUES
  (1, 'Core Router', '192.0.2.1', '02:00:00:00:00:01', 'Router', 'online', UTC_TIMESTAMP() - INTERVAL 1 MINUTE),
  (2, 'Design Workstation', '192.0.2.21', '02:00:00:00:00:15', 'Desktop', 'online', UTC_TIMESTAMP() - INTERVAL 2 MINUTE),
  (3, 'Lab Laptop', '192.0.2.34', '02:00:00:00:00:22', 'Laptop', 'online', UTC_TIMESTAMP() - INTERVAL 5 MINUTE),
  (4, 'Test Server', '192.0.2.50', '02:00:00:00:00:32', 'Server', 'offline', UTC_TIMESTAMP() - INTERVAL 42 MINUTE),
  (5, 'Sensor Hub', '192.0.2.65', '02:00:00:00:00:41', 'IoT', 'online', UTC_TIMESTAMP() - INTERVAL 1 MINUTE),
  (6, 'Mobile Test Device', '192.0.2.77', '02:00:00:00:00:4D', 'Mobile', 'online', UTC_TIMESTAMP() - INTERVAL 8 MINUTE);

INSERT INTO network_traffic (device_id, upload_mb, download_mb, protocol, recorded_at)
SELECT d.id, sample.upload_mb, sample.download_mb, sample.protocol,
  UTC_TIMESTAMP() - INTERVAL sample.minutes_ago MINUTE
FROM (
  SELECT 1 AS device_id, 18.20 AS upload_mb, 126.40 AS download_mb, 'HTTPS' AS protocol, 20 AS minutes_ago UNION ALL
  SELECT 2, 8.60, 74.30, 'TCP', 55 UNION ALL
  SELECT 3, 5.40, 42.10, 'HTTP', 90 UNION ALL
  SELECT 5, 2.80, 18.50, 'UDP', 125 UNION ALL
  SELECT 6, 11.30, 93.20, 'HTTPS', 160 UNION ALL
  SELECT 1, 21.70, 141.60, 'TCP', 195 UNION ALL
  SELECT 2, 9.40, 86.20, 'HTTPS', 230 UNION ALL
  SELECT 3, 4.10, 35.80, 'UDP', 265 UNION ALL
  SELECT 5, 3.20, 22.40, 'HTTP', 300 UNION ALL
  SELECT 6, 13.80, 112.70, 'TCP', 335 UNION ALL
  SELECT 1, 19.10, 132.90, 'HTTPS', 370 UNION ALL
  SELECT 2, 7.60, 64.10, 'HTTP', 405
) AS sample
JOIN devices d ON d.id = sample.device_id;

INSERT INTO performance_metrics (download_mbps, upload_mbps, latency_ms, packet_loss_percent, recorded_at) VALUES
  (286.40, 72.30, 18.20, 0.10, UTC_TIMESTAMP() - INTERVAL 7 HOUR),
  (274.10, 68.70, 21.60, 0.20, UTC_TIMESTAMP() - INTERVAL 6 HOUR),
  (301.80, 75.20, 16.40, 0.00, UTC_TIMESTAMP() - INTERVAL 5 HOUR),
  (253.60, 62.80, 24.10, 0.30, UTC_TIMESTAMP() - INTERVAL 4 HOUR),
  (268.90, 70.40, 19.30, 0.10, UTC_TIMESTAMP() - INTERVAL 3 HOUR),
  (292.30, 73.60, 17.80, 0.00, UTC_TIMESTAMP() - INTERVAL 2 HOUR),
  (279.70, 69.10, 20.50, 0.20, UTC_TIMESTAMP() - INTERVAL 1 HOUR),
  (294.50, 74.80, 17.20, 0.10, UTC_TIMESTAMP());

INSERT INTO activity_logs (device_id, device_name, ip_address, description, activity_type, created_at) VALUES
  (1, 'Core Router', '192.0.2.1', 'Simulation started; sample network data is being generated.', 'system', UTC_TIMESTAMP() - INTERVAL 8 HOUR),
  (2, 'Design Workstation', '192.0.2.21', 'HTTPS session established with the test gateway.', 'traffic', UTC_TIMESTAMP() - INTERVAL 6 HOUR),
  (5, 'Sensor Hub', '192.0.2.65', 'Device heartbeat recorded by the simulator.', 'device', UTC_TIMESTAMP() - INTERVAL 4 HOUR),
  (3, 'Lab Laptop', '192.0.2.34', 'TCP traffic sample recorded: 35.8 MB received.', 'traffic', UTC_TIMESTAMP() - INTERVAL 2 HOUR),
  (4, 'Test Server', '192.0.2.50', 'Test Server is offline in the sample topology.', 'device', UTC_TIMESTAMP() - INTERVAL 42 MINUTE);

INSERT INTO alerts (device_id, title, description, severity, status, created_at) VALUES
  (4, 'Device offline', 'Test Server (192.0.2.50) is marked offline in the sample topology.', 'high', 'open', UTC_TIMESTAMP() - INTERVAL 42 MINUTE),
  (2, 'High simulated traffic', 'Design Workstation recorded an elevated sample traffic interval.', 'medium', 'open', UTC_TIMESTAMP() - INTERVAL 3 HOUR),
  (5, 'Packet loss returned to normal', 'A previous sample packet-loss warning has been resolved.', 'low', 'resolved', UTC_TIMESTAMP() - INTERVAL 1 DAY);
