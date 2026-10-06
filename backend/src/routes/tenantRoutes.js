const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const c = require('../controllers/tenantController');

const router = express.Router();

router.use(protect, c.requireTenant);

router.get('/workspace', c.getWorkspace);
router.get('/events', c.listEvents);
router.get('/events/:id', c.getEvent);
router.get('/events/:id/posts', c.listPosts);
router.get('/events/:id/reports', c.listReports);
router.get('/events/:id/reports/latest', c.getLatestReport);
router.post('/events/:id/refresh', c.refreshEvent);
router.get('/reports/:reportId', c.getReport);

module.exports = router;
