const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const http = require('http');
const mongoose = require('mongoose');
const io = require(path.resolve(__dirname, '../../../client/node_modules/socket.io-client'));

const BASE_URL = 'http://localhost:3000/api';
const SOCKET_URL = 'http://localhost:3000';
const ORIGIN = 'http://localhost:5174';

function request(method, path, body = null, token = null) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const headers = {
            'Content-Type': 'application/json',
            'Origin': ORIGIN
        };
        if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const req = http.request({
            hostname: 'localhost',
            port: 3000,
            path: `/api${path}`,
            method,
            headers
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsed = null;
                try {
                    parsed = data ? JSON.parse(data) : null;
                } catch {
                    parsed = data;
                }
                resolve({ status: res.statusCode, headers: res.headers, data: parsed });
            });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

async function runFullQA() {
    console.log('========================================================');
    console.log('   STARTING QUEUELESS COMPREHENSIVE E2E QA TEST SUITE   ');
    console.log('========================================================\n');

    await mongoose.connect(process.env.MONGODB_URI);
    const User = require('../models/User');

    const ts = Date.now();
    const custEmail = `cust_${ts}@qa.com`;
    const staffEmail = `staff_${ts}@qa.com`;
    const staffPassword = 'StaffPassword123!';
    const adminEmail = `admin_${ts}@qa.com`;
    const adminPassword = 'AdminPassword123!';

    // ── Phase 1: Customer Passwordless Authentication Audit ──
    console.log('--- PHASE 1: CUSTOMER PASSWORDLESS CHECK-IN AUDIT ---');
    // 1.1 First-time customer check-in (no password required)
    const checkIn1 = await request('POST', '/auth/customer/check-in', {
        name: 'Jordan Taylor',
        email: custEmail
    });
    console.log('1. Customer Check-In status:', checkIn1.status);
    if (checkIn1.status !== 200 || !checkIn1.data?.token) {
        throw new Error(`Customer check-in failed: ${JSON.stringify(checkIn1.data)}`);
    }
    const custToken = checkIn1.data.token;
    const custId = checkIn1.data.user.id;
    if (checkIn1.data.user.passwordHash || checkIn1.data.user.password) {
        throw new Error('SECURITY VIOLATION: Password hash exposed in check-in response!');
    }
    console.log('   ✅ Customer check-in issued JWT without password (role:', checkIn1.data.user.role + ')');

    // 1.2 Repeat customer check-in with same email (reuses customer identity, updates name)
    const checkIn2 = await request('POST', '/auth/customer/check-in', {
        name: 'Jordan Taylor Updated',
        email: custEmail
    });
    console.log('2. Repeat Customer Check-In status:', checkIn2.status);
    if (checkIn2.status !== 200 || checkIn2.data.user.id !== custId) {
        throw new Error('Repeat check-in must reuse existing customer ID');
    }
    if (checkIn2.data.user.name !== 'Jordan Taylor Updated') {
        throw new Error('Repeat check-in should update customer name');
    }
    console.log('   ✅ Repeat check-in seamlessly reused customer ID and updated name');

    // 1.3 Missing name validation
    const badNameRes = await request('POST', '/auth/customer/check-in', { email: 'bad@test.com' });
    console.log('3. Check-In missing name status:', badNameRes.status);
    if (badNameRes.status !== 400) throw new Error('Missing name should return 400 Bad Request');
    console.log('   ✅ Missing name rejected with 400:', badNameRes.data?.error);

    // 1.4 Missing email validation
    const badEmailRes = await request('POST', '/auth/customer/check-in', { name: 'Valid Name' });
    console.log('4. Check-In missing email status:', badEmailRes.status);
    if (badEmailRes.status !== 400) throw new Error('Missing email should return 400 Bad Request');
    console.log('   ✅ Missing email rejected with 400:', badEmailRes.data?.error);

    // ── Phase 2: Staff & Admin Password-Based Authentication ──
    console.log('\n--- PHASE 2: STAFF & ADMIN PASSWORD-BASED AUTHENTICATION ---');
    // Create staff account with password
    await request('POST', '/auth/register', { name: 'QA Staff Desk', email: staffEmail, password: staffPassword });
    await User.updateOne({ email: staffEmail }, { $set: { role: 'STAFF' } });

    // Create admin account with password
    await request('POST', '/auth/register', { name: 'QA Admin User', email: adminEmail, password: adminPassword });
    await User.updateOne({ email: adminEmail }, { $set: { role: 'ADMIN' } });

    // 2.1 Staff login with correct password
    const staffLoginRes = await request('POST', '/auth/login', { email: staffEmail, password: staffPassword });
    console.log('1. Staff Login status:', staffLoginRes.status);
    if (staffLoginRes.status !== 200 || !staffLoginRes.data?.token) throw new Error('Staff login failed');
    const staffToken = staffLoginRes.data.token;
    console.log('   ✅ Staff logged in with password (role:', staffLoginRes.data.user?.role + ')');

    // 2.2 Staff login with wrong password rejected
    const badStaffPass = await request('POST', '/auth/login', { email: staffEmail, password: 'WrongPassword999!' });
    console.log('2. Staff wrong password status:', badStaffPass.status);
    if (badStaffPass.status !== 401) throw new Error('Wrong password must return 401');
    console.log('   ✅ Staff wrong password rejected with 401');

    // 2.3 Attempting to bypass password on STAFF account via customer check-in must be FORBIDDEN
    const bypassStaff = await request('POST', '/auth/customer/check-in', { name: 'Impostor', email: staffEmail });
    console.log('3. Customer check-in attempt using staff email status:', bypassStaff.status);
    if (bypassStaff.status !== 403) throw new Error('Check-in using staff email must be 403 Forbidden');
    console.log('   ✅ Privileged account bypass blocked with 403:', bypassStaff.data?.error);

    // 2.4 Admin login with password
    const adminLoginRes = await request('POST', '/auth/login', { email: adminEmail, password: adminPassword });
    if (adminLoginRes.status !== 200 || !adminLoginRes.data?.token) throw new Error('Admin login failed');
    const adminToken = adminLoginRes.data.token;
    console.log('4. Admin Login status: 200');
    console.log('   ✅ Admin logged in with password (role:', adminLoginRes.data.user?.role + ')');

    // ── Phase 3: Customer End-to-End Queue Flow ───────────────
    console.log('\n--- PHASE 3: CUSTOMER QUEUE END-TO-END FLOW ---');
    // 3.1 Fetch services
    const servicesRes = await request('GET', '/queue/services', null, custToken);
    console.log('1. Fetch services count:', servicesRes.data?.length);
    if (servicesRes.status !== 200 || !Array.isArray(servicesRes.data)) throw new Error('Services must be an array');
    const serviceId = servicesRes.data[0]._id;
    console.log('   ✅ Services loaded, selected:', servicesRes.data[0].name);

    // 3.2 Verify clean initial /queue/my
    const initMy = await request('GET', '/queue/my', null, custToken);
    if (initMy.status !== 404) throw new Error('Initial queue status must be 404');
    console.log('2. Initial /queue/my verified as clean (404)');

    // 3.3 Join queue
    const joinRes = await request('POST', '/queue/join', { serviceId }, custToken);
    console.log('3. Join queue status:', joinRes.status, '| tokenLabel:', joinRes.data?.tokenLabel);
    if (joinRes.status !== 201 || !joinRes.data?.tokenLabel) throw new Error('Queue join failed');
    const entryId = joinRes.data._id;
    const tokenLabel = joinRes.data.tokenLabel;

    // 3.4 Duplicate join blocked
    const dupJoin = await request('POST', '/queue/join', { serviceId }, custToken);
    console.log('4. Duplicate join status:', dupJoin.status);
    if (dupJoin.status !== 409) throw new Error('Duplicate join must be 409 Conflict');
    console.log('   ✅ Duplicate join blocked (409)');

    // 3.5 Self-cancel
    const cancelRes = await request('POST', `/queue/${entryId}/cancel`, null, custToken);
    console.log('5. Self-cancel status:', cancelRes.status, '| status:', cancelRes.data?.status);
    if (cancelRes.status !== 200 || cancelRes.data?.status !== 'CANCELLED') throw new Error('Cancel failed');
    console.log('   ✅ Customer cancelled active ticket');

    // 3.6 Re-join after cancellation
    const rejoinRes = await request('POST', '/queue/join', { serviceId }, custToken);
    console.log('6. Re-join status:', rejoinRes.status, '| tokenLabel:', rejoinRes.data?.tokenLabel);
    if (rejoinRes.status !== 201) throw new Error('Rejoin failed');
    const activeEntryId = rejoinRes.data._id;
    console.log('   ✅ Customer rejoined with new ticket:', rejoinRes.data?.tokenLabel);

    // ── Phase 4: Customer Security Audit ─────────────────────
    console.log('\n--- PHASE 4: CUSTOMER SECURITY AUDIT ---');
    // Customer cannot call next
    const callNextAttempt = await request('POST', '/queue/call-next', { serviceId }, custToken);
    console.log('1. Customer call-next status:', callNextAttempt.status);
    if (callNextAttempt.status !== 403) throw new Error('Customer call-next must be 403 Forbidden');
    console.log('   ✅ Customer forbidden from call-next (403)');

    // Customer cannot start serving
    const startAttempt = await request('POST', `/queue/${activeEntryId}/start`, null, custToken);
    console.log('2. Customer start-serving status:', startAttempt.status);
    if (startAttempt.status !== 403) throw new Error('Customer start must be 403 Forbidden');
    console.log('   ✅ Customer forbidden from start-serving (403)');

    // Customer cannot complete
    const compAttempt = await request('POST', `/queue/${activeEntryId}/complete`, null, custToken);
    console.log('3. Customer complete status:', compAttempt.status);
    if (compAttempt.status !== 403) throw new Error('Customer complete must be 403 Forbidden');
    console.log('   ✅ Customer forbidden from complete (403)');

    // Customer cannot cancel another customer's ticket
    const otherCust = await request('POST', '/auth/customer/check-in', { name: 'Other Cust', email: `other_${ts}@qa.com` });
    const otherJoin = await request('POST', '/queue/join', { serviceId }, otherCust.data.token);
    const stealCancel = await request('POST', `/queue/${otherJoin.data._id}/cancel`, null, custToken);
    console.log('4. Customer cancel other customer ticket status:', stealCancel.status);
    if (stealCancel.status !== 403) throw new Error('Customer cannot cancel another ticket');
    console.log('   ✅ IDOR prevention verified: customer cannot cancel another ticket (403)');

    // ── Phase 5: Real-Time Synchronization via Socket.IO ─────
    console.log('\n--- PHASE 5: REAL-TIME SOCKET.IO SYNCHRONIZATION ---');
    const custSocket = io(SOCKET_URL, {
        auth: { token: custToken },
        transports: ['websocket', 'polling']
    });

    const receivedEvents = [];

    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Cust socket timeout')), 4000);
        custSocket.on('connect', () => {
            console.log('   [Socket] Customer connected:', custSocket.id);
            custSocket.emit('join:service', serviceId, (ack) => {
                console.log('   [Socket] Joined service room ack:', ack);
                clearTimeout(timeout);
                resolve();
            });
        });
        custSocket.on('connect_error', reject);
    });

    custSocket.on('queue:called', (data) => receivedEvents.push('queue:called'));
    custSocket.on('queue:started', (data) => receivedEvents.push('queue:started'));
    custSocket.on('queue:completed', (data) => receivedEvents.push('queue:completed'));

    // Staff performs lifecycle
    console.log('1. Staff calling next...');
    const sCall = await request('POST', '/queue/call-next', { serviceId }, staffToken);
    await new Promise(r => setTimeout(r, 500));

    console.log('2. Staff starting serving on:', sCall.data.tokenLabel);
    await request('POST', `/queue/${sCall.data._id}/start`, null, staffToken);
    await new Promise(r => setTimeout(r, 500));

    console.log('3. Staff completing ticket on:', sCall.data.tokenLabel);
    await request('POST', `/queue/${sCall.data._id}/complete`, null, staffToken);
    await new Promise(r => setTimeout(r, 500));

    console.log('   Real-time events received:', receivedEvents);
    if (!receivedEvents.includes('queue:called') || !receivedEvents.includes('queue:started') || !receivedEvents.includes('queue:completed')) {
        throw new Error(`Real-time lifecycle events missing: ${receivedEvents.join(', ')}`);
    }
    console.log('   ✅ Real-time lifecycle: WAITING -> CALLED -> SERVING -> COMPLETED arrived via Socket.IO');

    custSocket.disconnect();

    // ── Phase 6: Admin Queue Management Operations ───────────
    console.log('\n--- PHASE 6: ADMIN QUEUE MANAGEMENT OPERATIONS ---');
    // Admin calls next ticket
    const adminCall = await request('POST', '/queue/call-next', { serviceId }, adminToken);
    console.log('1. Admin call-next status:', adminCall.status);
    if (adminCall.status !== 200 || !adminCall.data?._id) throw new Error('Admin call-next failed');
    console.log('   ✅ Admin called ticket:', adminCall.data.tokenLabel);

    const adminStart = await request('POST', `/queue/${adminCall.data._id}/start`, null, adminToken);
    if (adminStart.status !== 200 || adminStart.data.status !== 'SERVING') throw new Error('Admin start failed');
    console.log('   ✅ Admin started ticket:', adminStart.data.tokenLabel);

    const adminComp = await request('POST', `/queue/${adminCall.data._id}/complete`, null, adminToken);
    if (adminComp.status !== 200 || adminComp.data.status !== 'COMPLETED') throw new Error('Admin complete failed');
    console.log('   ✅ Admin completed ticket:', adminComp.data.tokenLabel);

    console.log('\n========================================================');
    console.log('   ALL E2E QA PHASES PASSED WITH ZERO ERRORS');
    console.log('========================================================\n');
    await mongoose.disconnect();
}

runFullQA()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('\n❌ QA TEST FAILED:', err);
        process.exit(1);
    });
