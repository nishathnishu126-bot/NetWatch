const express = require('express');
const controller = require('../controllers/apiController');

const router = express.Router();

router.get('/dashboard', controller.getDashboard);
router.get('/devices', controller.listDevices);
router.post('/devices', controller.createDevice);
router.put('/devices/:id', controller.updateDevice);
router.delete('/devices/:id', controller.deleteDevice);
router.get('/traffic', controller.getTraffic);
router.get('/performance', controller.getPerformance);
router.get('/logs', controller.getLogs);
router.get('/alerts', controller.getAlerts);
router.patch('/alerts/:id/resolve', controller.resolveAlert);
router.get('/reports', controller.getReports);

module.exports = router;
