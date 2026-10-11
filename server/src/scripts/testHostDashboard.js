require('dotenv').config();
const http = require('http');
const mongoose = require('mongoose');

function request(method, path, body = null, token = null) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const headers = { 'Content-Type': 'application/json' };
        if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const req = http.request({
            hostname: '127.0.0.1',
            port: process.env.PORT || 3000,
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

async function runDashboardTests() {
    console.log('========================================================');
    console.log('   STARTING HOST DASHBOARD QA TEST SUITE   ');
    console.log('========================================================\n');

    await mongoose.connect(process.env.MONGODB_URI);
    const User = require('../models/User');
    const QueueEntry = require('../models/QueueEntry');

    const ts = Date.now();
    const staffEmail = `staff_host_${ts}@qa.com`;
    const staffPassword = 'HostPassword123!';
    const customerEmail1 = `cust1_${ts}@qa.com`;
    const customerEmail2 = `cust2_${ts}@qa.com`;
    const customerEmail3 = `cust3_${ts}@qa.com`;

    // 1. Create Staff Account
    await request('POST', '/auth/register', { name: 'Host Staff', email: staffEmail, password: staffPassword });
    await User.updateOne({ email: staffEmail }, { $set: { role: 'STAFF' } });
    const staffLogin = await request('POST', '/auth/login', { email: staffEmail, password: staffPassword });
    if (staffLogin.status !== 200) throw new Error('Staff login failed');
    const staffToken = staffLogin.data.token;
    console.log('✅ Staff logged in');

    // 2. Check-in 3 Customers
    const cust1 = await request('POST', '/auth/customer/check-in', { name: 'Party Adams (4)', email: customerEmail1 });
    const cust2 = await request('POST', '/auth/customer/check-in', { name: 'Party Baker (2)', email: customerEmail2 });
    const cust3 = await request('POST', '/auth/customer/check-in', { name: 'Party Clark (6)', email: customerEmail3 });

    const cust1Token = cust1.data.token;
    const cust2Token = cust2.data.token;
    const cust3Token = cust3.data.token;

    // 3. Get Service ID
    const servicesRes = await request('GET', '/queue/services', null, cust1Token);
    const serviceId = servicesRes.data[0]._id;
    console.log(`✅ Using service: ${servicesRes.data[0].name} (${serviceId})`);

    // 4. Test Customer Security: Customers cannot access history or call
    const unauthHistory = await request('GET', `/queue/service/${serviceId}/history`, null, cust1Token);
    if (unauthHistory.status !== 403) throw new Error(`Customer should be forbidden (403) from history, got ${unauthHistory.status}`);
    console.log('✅ Customer access to staff history endpoint correctly rejected (403)');

    // 5. Join queue with 3 customers
    const join1 = await request('POST', '/queue/join', { serviceId }, cust1Token);
    const join2 = await request('POST', '/queue/join', { serviceId }, cust2Token);
    const join3 = await request('POST', '/queue/join', { serviceId }, cust3Token);
    console.log(`✅ 3 Parties joined queue: ${join1.data.tokenLabel}, ${join2.data.tokenLabel}, ${join3.data.tokenLabel}`);

    // 6. Test Specific Party Calling
    // Host calls Party 1 directly via /api/queue/:id/call
    const call1 = await request('POST', `/queue/${join1.data._id}/call`, null, staffToken);
    if (call1.status !== 200 || call1.data.status !== 'CALLED' || !call1.data.calledAt) {
        throw new Error(`Failed to call specific party: ${JSON.stringify(call1.data)}`);
    }
    console.log(`✅ Specific party called: ${call1.data.tokenLabel} with calledAt timestamp`);

    // 7. Host seats Party 1 (CALLED -> SERVING)
    const seat1 = await request('POST', `/queue/${join1.data._id}/start`, null, staffToken);
    if (seat1.status !== 200 || seat1.data.status !== 'SERVING' || !seat1.data.servedAt) {
        throw new Error(`Failed to seat party 1: ${JSON.stringify(seat1.data)}`);
    }
    console.log(`✅ Party 1 seated: ${seat1.data.tokenLabel} with servedAt timestamp`);

    // 8. Host calls and seats Party 2 as well -> Verify multiple seated parties simultaneously!
    const call2 = await request('POST', '/queue/call-next', { serviceId }, staffToken);
    if (call2.status !== 200 || call2.data.status !== 'CALLED') {
        throw new Error('Call next failed for party 2');
    }
    const seat2 = await request('POST', `/queue/${join2.data._id}/start`, null, staffToken);
    if (seat2.status !== 200 || seat2.data.status !== 'SERVING') {
        throw new Error('Seat failed for party 2');
    }
    console.log(`✅ Party 2 seated: ${seat2.data.tokenLabel}`);

    // 9. Verify Active Queue contains multiple SEATED parties and 1 WAITING party
    const activeQueueRes = await request('GET', `/queue/service/${serviceId}`, null, staffToken);
    const activeQueue = activeQueueRes.data;
    const seatedList = activeQueue.filter(e => e.status === 'SERVING');
    const waitingList = activeQueue.filter(e => e.status === 'WAITING');

    if (seatedList.length < 2) {
        throw new Error(`Expected at least 2 seated parties, got ${seatedList.length}`);
    }
    console.log(`✅ Multiple seated parties confirmed in active queue: ${seatedList.length} seated parties`);
    if (waitingList.length < 1) {
        throw new Error('Expected 1 waiting party');
    }
    console.log(`✅ Active waiting list confirmed: ${waitingList.length} waiting parties`);

    // 10. Clear Table for Party 1 (SERVING -> COMPLETED)
    const clear1 = await request('POST', `/queue/${join1.data._id}/complete`, null, staffToken);
    if (clear1.status !== 200 || clear1.data.status !== 'COMPLETED' || !clear1.data.completedAt) {
        throw new Error(`Failed to clear table for party 1: ${JSON.stringify(clear1.data)}`);
    }
    console.log(`✅ Party 1 table cleared: ${clear1.data.tokenLabel} with completedAt timestamp`);

    // 11. Fetch History and Cleared Today metric
    const historyRes = await request('GET', `/queue/service/${serviceId}/history`, null, staffToken);
    if (historyRes.status !== 200) {
        throw new Error(`Failed to fetch history: ${JSON.stringify(historyRes.data)}`);
    }
    const { history, clearedTodayCount } = historyRes.data;
    console.log(`✅ History retrieved: ${history.length} completed entries, clearedTodayCount: ${clearedTodayCount}`);

    const foundCleared = history.find(e => e._id.toString() === join1.data._id.toString());
    if (!foundCleared) {
        throw new Error('Recently cleared party 1 not found in history');
    }
    if (clearedTodayCount < 1) {
        throw new Error('clearedTodayCount should be at least 1');
    }
    console.log(`✅ Party 1 verified in recent history and clearedTodayCount metric is accurate!`);

    // 12. Clean up test entries
    await QueueEntry.deleteMany({ _id: { $in: [join1.data._id, join2.data._id, join3.data._id] } });
    await User.deleteMany({ email: { $in: [staffEmail, customerEmail1, customerEmail2, customerEmail3] } });
    await mongoose.disconnect();

    console.log('\n========================================================');
    console.log('   ALL HOST DASHBOARD BACKEND TESTS PASSED (12/12)   ');
    console.log('========================================================');
}

runDashboardTests().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
