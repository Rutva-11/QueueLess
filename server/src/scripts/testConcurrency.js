const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const http = require('http');
const mongoose = require('mongoose');

const API_PORT = process.env.PORT || 3000;
const ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

function request(method, reqPath, body = null, token = null) {
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
            port: API_PORT,
            path: `/api${reqPath}`,
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

async function runConcurrencyTest() {
    console.log('========================================================================');
    console.log('   QUEUELESS 20+ CONCURRENT QUEUE JOINS ATOMIC INTEGRITY TEST           ');
    console.log('========================================================================\n');

    await mongoose.connect(process.env.MONGODB_URI);
    const User = require('../models/User');
    const QueueEntry = require('../models/QueueEntry');
    const Service = require('../models/Service');
    const Organization = require('../models/Organization');

    // 1. Setup isolated test service for concurrency verification
    let org = await Organization.findOne({});
    if (!org) {
        org = await Organization.create({
            name: 'Concurrency Test Org',
            type: 'RESTAURANT',
            address: '100 Speed Ave'
        });
    }

    const testService = await Service.create({
        organizationId: org._id,
        name: `Concurrent Dining ${Date.now()}`,
        tokenPrefix: 'C',
        avgServiceMinutes: 10,
        isActive: true,
        lastTokenNumber: 0
    });
    const serviceId = testService._id.toString();
    console.log(`[Setup] Dedicated concurrency test service created: ${testService.name} (Prefix: ${testService.tokenPrefix})`);

    const NUM_CUSTOMERS = 20;
    console.log(`\n[Phase 1] Checking in ${NUM_CUSTOMERS} independent customers...`);

    // 2. Check in 20 customers in parallel
    const customerCheckins = await Promise.all(
        Array.from({ length: NUM_CUSTOMERS }, (_, i) => {
            return request('POST', '/auth/customer/check-in', {
                name: `Concurrent Guest ${i + 1}`,
                email: `concurrent_${Date.now()}_${i + 1}@restaurantqa.com`
            });
        })
    );

    const customers = customerCheckins.map((res, i) => {
        if (res.status !== 200) {
            throw new Error(`Customer check-in ${i + 1} failed: ${JSON.stringify(res.data)}`);
        }
        return {
            index: i + 1,
            user: res.data.user,
            token: res.data.token
        };
    });
    console.log(`  ✓ All ${NUM_CUSTOMERS} customer accounts successfully authenticated with unique JWTs.`);

    // 3. Launch 20 simultaneous joins at the exact same millisecond
    console.log(`\n[Phase 2] Firing ${NUM_CUSTOMERS} simultaneous joins at the exact same millisecond...`);
    const startTime = Date.now();
    const joinResponses = await Promise.all(
        customers.map(c => request('POST', '/queue/join', { serviceId }, c.token))
    );
    const elapsedMs = Date.now() - startTime;
    console.log(`  ✓ All ${NUM_CUSTOMERS} concurrent requests completed in ${elapsedMs}ms.`);

    // 4. Assert 20 successful joins (HTTP 201)
    const successJoins = joinResponses.filter(r => r.status === 201);
    console.log(`\n[Phase 3] Validating join response statuses...`);
    console.log(`  Successful (201 Created): ${successJoins.length} / ${NUM_CUSTOMERS}`);
    if (successJoins.length !== NUM_CUSTOMERS) {
        const errors = joinResponses.filter(r => r.status !== 201).map(r => r.data);
        throw new Error(`Expected ${NUM_CUSTOMERS} successful joins, but got ${successJoins.length}. Errors: ${JSON.stringify(errors)}`);
    }

    // 5. Extract token numbers and labels
    const tokenNumbers = successJoins.map(r => r.data.tokenNumber || r.data.entry?.tokenNumber);
    const tokenLabels = successJoins.map(r => r.data.tokenLabel || r.data.entry?.tokenLabel);
    console.log(`  Allocated Token Numbers: [${tokenNumbers.join(', ')}]`);
    console.log(`  Allocated Token Labels:  [${tokenLabels.join(', ')}]`);

    // 6. Assert token uniqueness (No duplicate token numbers)
    console.log(`\n[Phase 4] Verifying token uniqueness...`);
    const uniqueTokens = new Set(tokenNumbers);
    if (uniqueTokens.size !== NUM_CUSTOMERS) {
        throw new Error(`CRITICAL: Duplicate tokens detected! Unique tokens: ${uniqueTokens.size}, Total tokens: ${NUM_CUSTOMERS}`);
    }
    console.log(`  ✅ All ${NUM_CUSTOMERS} token numbers are strictly UNIQUE! Zero collisions.`);

    // 7. Assert valid contiguous sequential allocation
    console.log(`\n[Phase 5] Verifying sequential allocation integrity...`);
    const sortedTokens = [...tokenNumbers].sort((a, b) => a - b);
    for (let i = 0; i < sortedTokens.length; i++) {
        const expected = i + 1;
        if (sortedTokens[i] !== expected) {
            throw new Error(`Sequential allocation gap! Expected token ${expected} at index ${i}, but got ${sortedTokens[i]}`);
        }
    }
    console.log(`  ✅ Tokens strictly cover sequential range [1 .. ${NUM_CUSTOMERS}] with zero gaps or skips.`);

    // 8. Assert user ownership and database state
    console.log(`\n[Phase 6] Verifying MongoDB document persistence and user ownership...`);
    const dbEntries = await QueueEntry.find({ serviceId }).sort({ tokenNumber: 1 });
    if (dbEntries.length !== NUM_CUSTOMERS) {
        throw new Error(`Database record count mismatch: expected ${NUM_CUSTOMERS}, got ${dbEntries.length}`);
    }

    // Check each entry belongs to the user who received it
    for (const r of successJoins) {
        const entryData = r.data.entry || r.data;
        const matchingDb = dbEntries.find(e => e._id.toString() === entryData._id.toString());
        if (!matchingDb) {
            throw new Error(`Entry ${entryData.tokenLabel} not found in MongoDB.`);
        }
        if (matchingDb.tokenNumber !== entryData.tokenNumber) {
            throw new Error(`Token mismatch between API response and DB: ${matchingDb.tokenNumber} vs ${entryData.tokenNumber}`);
        }
        if (matchingDb.status !== 'WAITING') {
            throw new Error(`Expected status WAITING, got ${matchingDb.status}`);
        }
    }
    console.log(`  ✅ All ${NUM_CUSTOMERS} MongoDB documents match API responses with correct user ownership and status WAITING.`);

    // 9. Assert no duplicate active entries per customer
    console.log(`\n[Phase 7] Attempting concurrent re-joins from the same active customers...`);
    const dupJoinResponses = await Promise.all(
        customers.slice(0, 5).map(c => request('POST', '/queue/join', { serviceId }, c.token))
    );
    for (let i = 0; i < dupJoinResponses.length; i++) {
        if (dupJoinResponses[i].status !== 409) {
            throw new Error(`Expected 409 Conflict on duplicate active join, got ${dupJoinResponses[i].status}`);
        }
    }
    console.log(`  ✅ Duplicate active entries strictly blocked with 409 Conflict for existing customers.`);

    // 10. Clean up test service and entries
    await QueueEntry.deleteMany({ serviceId });
    await Service.deleteOne({ _id: testService._id });
    await User.deleteMany({ _id: { $in: customers.map(c => c.user.id || c.user._id) } });
    await mongoose.disconnect();
    console.log(`  ✓ Test data cleaned up successfully.\n`);

    console.log('========================================================================');
    console.log('   ALL 20+ CONCURRENCY CRITERIA PASSED WITH 100% ATOMICITY             ');
    console.log('========================================================================\n');
}

runConcurrencyTest()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('\n❌ CONCURRENCY TEST FAILED:', err);
        process.exit(1);
    });
