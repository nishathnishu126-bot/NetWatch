const pool = require('../config/db');

const protocols = ['TCP', 'UDP', 'HTTP', 'HTTPS'];
let timer;

async function generateSample() {
  const [devices] = await pool.query('SELECT id, device_name, ip_address, status FROM devices ORDER BY id');
  if (!devices.length) return;

  const chosen = devices[Math.floor(Math.random() * devices.length)];
  const download = Number((8 + Math.random() * 62).toFixed(2));
  const upload = Number((1 + Math.random() * 18).toFixed(2));
  const protocol = protocols[Math.floor(Math.random() * protocols.length)];

  await pool.execute(
    'INSERT INTO network_traffic (device_id, upload_mb, download_mb, protocol) VALUES (?, ?, ?, ?)',
    [chosen.id, upload, download, protocol],
  );
  const metrics = {
    download: Number((55 + Math.random() * 290).toFixed(2)),
    upload: Number((12 + Math.random() * 75).toFixed(2)),
    latency: Number((12 + Math.random() * 75).toFixed(2)),
    loss: Number((Math.random() * 1.8).toFixed(2)),
  };
  await pool.execute(
    `INSERT INTO performance_metrics (download_mbps, upload_mbps, latency_ms, packet_loss_percent)
     VALUES (?, ?, ?, ?)`,
    [metrics.download, metrics.upload, metrics.latency, metrics.loss],
  );

  const flipStatus = Math.random() < 0.12;
  if (flipStatus) {
    const nextStatus = chosen.status === 'online' ? 'offline' : 'online';
    await pool.execute('UPDATE devices SET status = ?, last_active = UTC_TIMESTAMP() WHERE id = ?', [nextStatus, chosen.id]);
    const description = `${chosen.device_name} went ${nextStatus}`;
    await pool.execute(
      `INSERT INTO activity_logs (device_id, device_name, ip_address, description, activity_type)
       VALUES (?, ?, ?, ?, 'device')`,
      [chosen.id, chosen.device_name, chosen.ip_address, description],
    );
    if (nextStatus === 'offline') {
      await pool.execute(
        `INSERT INTO alerts (device_id, title, description, severity)
         VALUES (?, 'Device offline', ?, 'high')`,
        [chosen.id, `${chosen.device_name} (${chosen.ip_address}) is no longer responding in the simulation.`],
      );
    }
  } else {
    await pool.execute('UPDATE devices SET last_active = UTC_TIMESTAMP() WHERE id = ?', [chosen.id]);
  }

  if (download > 60 && Math.random() < 0.3) {
    await pool.execute(
      `INSERT INTO alerts (device_id, title, description, severity)
       VALUES (?, 'High simulated traffic', ?, 'medium')`,
      [chosen.id, `${chosen.device_name} recorded ${download} MB of simulated download traffic.`],
    );
  }
  await pool.execute(
    `INSERT INTO activity_logs (device_id, device_name, ip_address, description, activity_type)
     VALUES (?, ?, ?, ?, 'traffic')`,
    [chosen.id, chosen.device_name, chosen.ip_address, `${protocol} traffic sampled: ${download} MB down / ${upload} MB up`],
  );
  await pool.execute('DELETE FROM network_traffic WHERE recorded_at < UTC_TIMESTAMP() - INTERVAL 14 DAY');
  await pool.execute('DELETE FROM performance_metrics WHERE recorded_at < UTC_TIMESTAMP() - INTERVAL 14 DAY');
  await pool.execute('DELETE FROM activity_logs WHERE created_at < UTC_TIMESTAMP() - INTERVAL 14 DAY');
  await pool.execute('DELETE FROM alerts WHERE created_at < UTC_TIMESTAMP() - INTERVAL 90 DAY');
}

function startSimulator() {
  if (timer) return;
  timer = setInterval(() => {
    generateSample().catch((error) => console.error('Simulation cycle failed:', error));
  }, 60_000);
  timer.unref();
}

module.exports = { startSimulator, generateSample };
