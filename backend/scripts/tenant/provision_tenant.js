/**
 * provision_tenant.js
 * ─────────────────────────────────────────────────────────────────────
 * Creates (or updates) an isolated tenant workspace inside this deployment:
 * the workspace row, its login, and its monitored events — all from a JSON
 * spec. Idempotent: re-running updates the workspace and events in place.
 *
 * The password is read from TENANT_USER_PASSWORD (never from the spec, so it
 * is not committed). An existing tenant user's password is changed only with
 * --reset-password. Refuses to touch an email that belongs to a Goa user.
 *
 *   TENANT_USER_PASSWORD='…' node scripts/tenant/provision_tenant.js \
 *       --spec scripts/tenant/specs/gyanesh_cjp.json [--reset-password]
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../../src/models/User');
const TenantWorkspace = require('../../src/models/tenant/TenantWorkspace');
const TenantEvent = require('../../src/models/tenant/TenantEvent');
const { DEFAULT_TENANT, tenantOf } = require('../../src/config/tenancy');

const arg = (name) => {
    const i = process.argv.indexOf(name);
    return i === -1 ? null : process.argv[i + 1];
};

const main = async () => {
    const specPath = arg('--spec');
    if (!specPath) throw new Error('--spec is required');
    const spec = JSON.parse(fs.readFileSync(path.resolve(specPath), 'utf8'));
    const tenantId = String(spec.tenant_id || '').trim();
    if (!tenantId || tenantId === DEFAULT_TENANT) throw new Error(`tenant_id must be set and must not be "${DEFAULT_TENANT}"`);

    await mongoose.connect(process.env.MONGODB_URI, process.env.DB_NAME ? { dbName: process.env.DB_NAME } : undefined);

    // Workspace
    await TenantWorkspace.updateOne(
        { tenant_id: tenantId },
        { $set: { ...spec.workspace, tenant_id: tenantId } },
        { upsert: true },
    );
    console.log(`workspace  ${tenantId}: ok`);

    // User (skipped with --no-user, e.g. when the login is created by another app's own user model)
    if (process.argv.includes('--no-user')) {
        for (const ev of spec.events || []) {
            const doc = {
                ...ev, tenant_id: tenantId, created_by: null,
                start_date: new Date(ev.start_date), end_date: ev.end_date ? new Date(ev.end_date) : null,
                collection_plan: { ...ev.collection_plan, since: ev.collection_plan?.since ? new Date(ev.collection_plan.since) : null },
            };
            const existing = await TenantEvent.findOne(ev.id ? { tenant_id: tenantId, id: ev.id } : { tenant_id: tenantId, name: ev.name });
            if (existing) { existing.set(doc); await existing.save(); console.log(`event      "${ev.name}": updated (${existing.id})`); }
            else { const created = await TenantEvent.create(doc); console.log(`event      "${ev.name}": created (${created.id})`); }
        }
        return;
    }

    // User
    const email = spec.user.email.toLowerCase().trim();
    const password = process.env.TENANT_USER_PASSWORD;
    let user = await User.findOne({ email });
    if (user && tenantOf(user) !== tenantId) {
        throw new Error(`${email} already exists in tenant "${tenantOf(user)}" — refusing to move it`);
    }
    if (!user) {
        if (!password) throw new Error('TENANT_USER_PASSWORD is required to create the user');
        user = await User.create({
            email,
            full_name: spec.user.full_name,
            password: await bcrypt.hash(password, 10),
            role: 'viewer',
            tenant_id: tenantId,
            is_active: true,
        });
        console.log(`user       ${email}: created`);
    } else {
        user.full_name = spec.user.full_name;
        user.role = 'viewer';
        user.is_active = true;
        if (process.argv.includes('--reset-password')) {
            if (!password) throw new Error('TENANT_USER_PASSWORD is required with --reset-password');
            user.password = await bcrypt.hash(password, 10);
        }
        await user.save();
        console.log(`user       ${email}: updated${process.argv.includes('--reset-password') ? ' (password reset)' : ''}`);
    }

    // Events: matched on `id` when the spec pins one (so renaming an event updates it), else on name.
    for (const ev of spec.events || []) {
        const doc = {
            ...ev,
            tenant_id: tenantId,
            created_by: user.id,
            start_date: new Date(ev.start_date),
            end_date: ev.end_date ? new Date(ev.end_date) : null,
            collection_plan: { ...ev.collection_plan, since: ev.collection_plan?.since ? new Date(ev.collection_plan.since) : null },
        };
        const existing = await TenantEvent.findOne(ev.id ? { tenant_id: tenantId, id: ev.id } : { tenant_id: tenantId, name: ev.name });
        if (existing) {
            existing.set(doc);
            await existing.save();
            console.log(`event      "${ev.name}": updated (${existing.id})`);
        } else {
            const created = await TenantEvent.create(doc);
            console.log(`event      "${ev.name}": created (${created.id})`);
        }
    }
};

main()
    .then(() => mongoose.disconnect())
    .catch(async (err) => {
        console.error('provision failed:', err.message);
        await mongoose.disconnect();
        process.exit(1);
    });
