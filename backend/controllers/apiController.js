const pool = require('../config/db');

const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

const validId = (value) => /^\d+$/.test(String(value)) && Number(value) > 0;
const allowedTypes = ['Router', 'Laptop', 'Desktop', 'Mobile', 'Server', 'IoT'];
const allowedStatuses = ['online', 'offline'];

function validateDevice(body, partial = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    const error = new Error('Request body must be a JSON object.');
    error.status = 400;
    throw error;
  }
  const fields = ['device_name', 'ip_address', 'mac_address', 'device_type', 'status'];
  const required = ['device_name', 'ip_address', 'mac_address', 'device_type'];
  if (fields.some((key) => body[key] !== undefined && typeof body[key] !== 'string')) {
    const error = new Error('Device fields must be strings.');
    error.status = 400;
    throw error;
  }
  if (!partial && required.some((key) => !String(body[key] || '').trim())) {
    const error = new Error('Name, IP address, MAC address and device type are required.');
    error.status = 400;
    throw error;
  }
  if (partial && fields.some((key) => body[key] !== undefined && !String(body[key]).trim())) {
    const error = new Error('Device fields cannot be empty.');
    error.status = 400;
    throw error;
  }
  if (body.ip_address !== undefined &&
      !/^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/.test(body.ip_address)) {
    const error = new Error('Enter a valid IPv4 address.');
    error.status = 400;
    throw error;
  }
  if (body.mac_address !== undefined &&
      !/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(body.mac_address)) {
    const error = new Error('Enter a valid MAC address in format AA:BB:CC:DD:EE:FF.');
    error.status = 400;
    throw error;
  }
  if (body.device_type !== undefined && !allowedTypes.includes(body.device_type)) {
    const error = new Error(`Device type must be one of: ${allowedTypes.join(', ')}.`);
    error.status = 400;
    throw error;
  }
  if (body.device_name !== undefined && body.device_name.trim().length > 100) {
    const error = new Error('Device name must be 100 characters or fewer.');
    error.status = 400;
    throw error;
  }
  if (body.status !== undefined && !allowedStatuses.includes(body.status)) {
    const error = new Error('Status must be online or offline.');
    error.status = 400;
    throw error;
  }
}

function dateFilter(query) {
  const { from, to } = query;
  const isoDate = /^\d{4}-\d{2}-\d{2}$/;
  if ((from && !isoDate.test(from)) || (to && !isoDate.test(to))) {
    const error = new Error('Dates must use YYYY-MM-DD format.');
    error.status = 400;
    throw error;
  }
  return {
    clause: `${from ? ' AND DATE(recorded_at) >= ?' : ''}${to ? ' AND DATE(recorded_at) <= ?' : ''}`,
    values: [from, to].filter(Boolean),
  };
}

const getDashboard = asyncHandler(async (_req, res) => {
  const [[devices]] = await pool.query(`
    SELECT COUNT(*) AS total,
      SUM(status = 'online') AS online,
      SUM(status = 'offline') AS offline
    FROM devices`);
  const [[traffic]] = await pool.query(`
    SELECT COALESCE(SUM(upload_mb + download_mb), 0) AS total_mb
    FROM network_traffic
    WHERE recorded_at >= UTC_TIMESTAMP() - INTERVAL 24 HOUR`);
  const [trafficSeries] = await pool.query(`
    SELECT DATE_FORMAT(MIN(recorded_at), '%H:00') AS label,
      ROUND(SUM(download_mb), 2) AS download,
      ROUND(SUM(upload_mb), 2) AS upload,
      DATE_FORMAT(MIN(recorded_at), '%Y-%m-%d %H:00:00') AS sort_time
    FROM network_traffic
    WHERE recorded_at >= UTC_TIMESTAMP() - INTERVAL 12 HOUR
    GROUP BY DATE_FORMAT(recorded_at, '%Y-%m-%d %H')
    ORDER BY sort_time`);
  const [devicesByType] = await pool.query(`
    SELECT device_type AS name, COUNT(*) AS count
    FROM devices GROUP BY device_type ORDER BY count DESC`);
  const [recentActivity] = await pool.query(`
    SELECT id, device_name, ip_address, description, activity_type, created_at
    FROM activity_logs ORDER BY created_at DESC LIMIT 6`);
  const [[performance]] = await pool.query(`
    SELECT download_mbps, upload_mbps, latency_ms, packet_loss_percent, recorded_at
    FROM performance_metrics ORDER BY recorded_at DESC LIMIT 1`);
  res.json({
    devices: { total: Number(devices.total), online: Number(devices.online || 0), offline: Number(devices.offline || 0) },
    traffic: { total_mb: Number(traffic.total_mb || 0) },
    trafficSeries,
    devicesByType,
    recentActivity,
    performance: performance || null,
    health: Number(devices.offline || 0) === 0 ? 'healthy' : 'attention',
    simulated: true,
  });
});

const listDevices = asyncHandler(async (req, res) => {
  const { search = '', status = '' } = req.query;
  if (typeof search !== 'string' || search.length > 100) {
    const error = new Error('Search must be 100 characters or fewer.');
    error.status = 400;
    throw error;
  }
  if (status && !allowedStatuses.includes(status)) {
    const error = new Error('Status must be online or offline.');
    error.status = 400;
    throw error;
  }
  const values = [];
  let where = '';
  if (search.trim()) {
    const term = `%${search.trim()}%`;
    where += ' AND (device_name LIKE ? OR ip_address LIKE ? OR mac_address LIKE ? OR device_type LIKE ?)';
    values.push(term, term, term, term);
  }
  if (status) {
    where += ' AND status = ?';
    values.push(status);
  }
  const [devices] = await pool.query(
    `SELECT id, device_name, ip_address, mac_address, device_type, status, last_active, created_at
     FROM devices WHERE 1=1${where} ORDER BY device_name`,
    values,
  );
  res.json(devices);
});

const createDevice = asyncHandler(async (req, res) => {
  validateDevice(req.body);
  const { device_name, ip_address, mac_address, device_type } = req.body;
  const status = req.body.status || 'online';
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute(
      `INSERT INTO devices (device_name, ip_address, mac_address, device_type, status, last_active)
       VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
      [device_name.trim(), ip_address, mac_address.toUpperCase(), device_type, status],
    );
    await connection.execute(
      `INSERT INTO activity_logs (device_id, device_name, ip_address, description, activity_type)
       VALUES (?, ?, ?, ?, 'device')`,
      [result.insertId, device_name.trim(), ip_address, `Device ${device_name.trim()} was registered`],
    );
    await connection.commit();
    const [rows] = await connection.execute('SELECT * FROM devices WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      error.status = 409;
      error.message = 'That IP address or MAC address is already registered.';
    }
    throw error;
  } finally {
    connection.release();
  }
});

const updateDevice = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Device ID must be a positive integer.' });
  validateDevice(req.body, true);
  const columns = ['device_name', 'ip_address', 'mac_address', 'device_type', 'status'];
  const updates = columns.filter((key) => req.body[key] !== undefined);
  if (!updates.length) return res.status(400).json({ error: 'Provide at least one device field to update.' });
  const values = updates.map((key) => key === 'device_name' ? req.body[key].trim() : key === 'mac_address' ? req.body[key].toUpperCase() : req.body[key]);
  const [result] = await pool.execute(
    `UPDATE devices SET ${updates.map((key) => `${key} = ?`).join(', ')}, updated_at = UTC_TIMESTAMP() WHERE id = ?`,
    [...values, req.params.id],
  );
  if (!result.affectedRows) return res.status(404).json({ error: 'Device not found.' });
  const [rows] = await pool.execute('SELECT * FROM devices WHERE id = ?', [req.params.id]);
  res.json(rows[0]);
});

const deleteDevice = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Device ID must be a positive integer.' });
  const [rows] = await pool.execute('SELECT device_name FROM devices WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Device not found.' });
  await pool.execute('DELETE FROM devices WHERE id = ?', [req.params.id]);
  res.json({ message: `${rows[0].device_name} was removed.` });
});

const getTraffic = asyncHandler(async (_req, res) => {
  const [hourly] = await pool.query(`
    SELECT DATE_FORMAT(MIN(recorded_at), '%H:00') AS label,
      ROUND(SUM(download_mb), 2) AS download,
      ROUND(SUM(upload_mb), 2) AS upload,
      DATE_FORMAT(MIN(recorded_at), '%Y-%m-%d %H:00:00') AS sort_time
    FROM network_traffic
    WHERE recorded_at >= UTC_TIMESTAMP() - INTERVAL 24 HOUR
    GROUP BY DATE_FORMAT(recorded_at, '%Y-%m-%d %H')
    ORDER BY sort_time`);
  const [daily] = await pool.query(`
    SELECT DATE_FORMAT(MIN(recorded_at), '%b %d') AS label,
      ROUND(SUM(download_mb), 2) AS download, ROUND(SUM(upload_mb), 2) AS upload
    FROM network_traffic
    WHERE recorded_at >= UTC_TIMESTAMP() - INTERVAL 7 DAY
    GROUP BY DATE(recorded_at) ORDER BY DATE(recorded_at)`);
  const [protocols] = await pool.query(`
    SELECT protocol AS name, COUNT(*) AS count, ROUND(SUM(upload_mb + download_mb), 2) AS total_mb
    FROM network_traffic
    WHERE recorded_at >= UTC_TIMESTAMP() - INTERVAL 7 DAY
    GROUP BY protocol ORDER BY total_mb DESC`);
  const [history] = await pool.query(`
    SELECT t.id, t.upload_mb, t.download_mb, t.protocol, t.recorded_at,
      d.device_name, d.ip_address
    FROM network_traffic t LEFT JOIN devices d ON t.device_id = d.id
    ORDER BY t.recorded_at DESC LIMIT 30`);
  res.json({ hourly, daily, protocols, history });
});

const getPerformance = asyncHandler(async (_req, res) => {
  const [records] = await pool.query(`
    SELECT id, download_mbps, upload_mbps, latency_ms, packet_loss_percent, recorded_at
    FROM performance_metrics ORDER BY recorded_at DESC LIMIT 24`);
  res.json({ records: records.reverse(), current: records.at(-1) || null });
});

const getLogs = asyncHandler(async (req, res) => {
  const { search = '', type = '' } = req.query;
  if (typeof search !== 'string' || search.length > 100) {
    const error = new Error('Search must be 100 characters or fewer.');
    error.status = 400;
    throw error;
  }
  const types = ['device', 'traffic', 'performance', 'alert', 'system'];
  if (type && !types.includes(type)) {
    const error = new Error('Invalid activity type.');
    error.status = 400;
    throw error;
  }
  let where = '';
  const values = [];
  if (search.trim()) {
    const term = `%${search.trim()}%`;
    where += ' AND (device_name LIKE ? OR ip_address LIKE ? OR description LIKE ?)';
    values.push(term, term, term);
  }
  if (type) {
    where += ' AND activity_type = ?';
    values.push(type);
  }
  const [logs] = await pool.query(
    `SELECT id, device_name, ip_address, description, activity_type, created_at
     FROM activity_logs WHERE 1=1${where} ORDER BY created_at DESC LIMIT 250`,
    values,
  );
  res.json(logs);
});

const getAlerts = asyncHandler(async (_req, res) => {
  const [alerts] = await pool.query(`
    SELECT a.id, a.title, a.description, a.severity, a.status, a.created_at,
      d.device_name, d.ip_address
    FROM alerts a LEFT JOIN devices d ON a.device_id = d.id
    ORDER BY (a.status = 'open') DESC, a.created_at DESC LIMIT 100`);
  res.json(alerts);
});

const resolveAlert = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: 'Alert ID must be a positive integer.' });
  const [result] = await pool.execute(
    "UPDATE alerts SET status = 'resolved', resolved_at = UTC_TIMESTAMP() WHERE id = ? AND status = 'open'",
    [req.params.id],
  );
  if (!result.affectedRows) return res.status(404).json({ error: 'Open alert not found.' });
  const [rows] = await pool.execute('SELECT * FROM alerts WHERE id = ?', [req.params.id]);
  res.json(rows[0]);
});

const getReports = asyncHandler(async (req, res) => {
  const filter = dateFilter(req.query);
  const [traffic] = await pool.query(
    `SELECT DATE(recorded_at) AS date, ROUND(SUM(download_mb), 2) AS download_mb,
      ROUND(SUM(upload_mb), 2) AS upload_mb, COUNT(*) AS records
     FROM network_traffic WHERE 1=1${filter.clause}
     GROUP BY DATE(recorded_at) ORDER BY DATE(recorded_at)`,
    filter.values,
  );
  const [performance] = await pool.query(
    `SELECT ROUND(AVG(download_mbps), 2) AS avg_download_mbps,
      ROUND(AVG(upload_mbps), 2) AS avg_upload_mbps,
      ROUND(AVG(latency_ms), 2) AS avg_latency_ms,
      ROUND(AVG(packet_loss_percent), 2) AS avg_packet_loss
     FROM performance_metrics WHERE 1=1${filter.clause}`,
    filter.values,
  );
  const [[devices]] = await pool.query(`
    SELECT COUNT(*) AS total, SUM(status = 'online') AS online, SUM(status = 'offline') AS offline
    FROM devices`);
  res.json({
    range: { from: req.query.from || null, to: req.query.to || null },
    devices: { total: Number(devices.total), online: Number(devices.online || 0), offline: Number(devices.offline || 0) },
    traffic,
    performance: performance[0],
  });
});

module.exports = {
  getDashboard, listDevices, createDevice, updateDevice, deleteDevice,
  getTraffic, getPerformance, getLogs, getAlerts, resolveAlert, getReports,
};
