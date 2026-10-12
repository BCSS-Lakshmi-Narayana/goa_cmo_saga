/**
 * Starts collect → classify → report for a tenant event inside the running
 * backend (POST /api/tenant/events/:id/refresh), which is the only place
 * Telegram can be collected. Prints progress until the run finishes.
 *
 *   node scripts/tenant/trigger_refresh.js --tenant <id> --event <event id> [--api http://127.0.0.1:8010]
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const axios = require('axios');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../../src/models/User');
const { getJwtSecret } = require('../../src/config/jwtSecret');

const arg = (name, def = null) => {
    const i = process.argv.indexOf(name);
    return i === -1 ? def : process.argv[i + 1];
};

const main = async () => {
    const tenantId = arg('--tenant');
    const eventId = arg('--event');
    const api = String(arg('--api', 'http://127.0.0.1:8010')).replace(/\/+$/, '');
    if (!tenantId || !eventId) throw new Error('--tenant and --event are required');

    await mongoose.connect(process.env.MONGODB_URI, process.env.DB_NAME ? { dbName: process.env.DB_NAME } : undefined);
    const user = await User.findOne({ tenant_id: tenantId, is_active: { $ne: false } }).lean();
    await mongoose.disconnect();
    if (!user) throw new Error('no active user in that tenant');

    const auth = { headers: { Authorization: `Bearer ${jwt.sign({ user_id: user.id }, getJwtSecret(), { expiresIn: '6h' })}` } };
    const start = await axios.post(`${api}/api/tenant/events/${eventId}/refresh`, {}, { ...auth, validateStatus: () => true });
    console.log(`refresh: HTTP ${start.status} ${start.data?.message || ''}`);
    if (start.status !== 202 && start.status !== 409) process.exit(1);

    let lastLine = '';
    for (;;) {
        await new Promise((r) => setTimeout(r, 30000));
        const { data } = await axios.get(`${api}/api/tenant/events/${eventId}`, auth);
        const p = data.pipeline || {};
        const line = `stage=${p.stage} ${p.progress ? JSON.stringify(p.progress) : ''}`;
        if (line !== lastLine) { console.log(`${new Date().toISOString()} ${line}`); lastLine = line; }
        if (!p.running) {
            if (p.collection) console.log('collection:', JSON.stringify(p.collection.platforms));
            console.log(p.error ? `failed: ${p.error}` : `report: ${p.report_id}`);
            break;
        }
    }
};

main().catch((err) => { console.error('trigger failed:', err.message); process.exit(1); });
