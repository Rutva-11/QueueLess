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
    const call2 = await request('POST', `/queue/${join2.data._id}/call`, null, staffToken);
    if (call2.status !== 200 || call2.data.status !== 'CALLED') {
        throw new Error(`Call party 2 failed: ${JSON.stringify(call2.data)}`);
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
    const baselineHistoryRes = await request('GET', `/queue/service/${serviceId}/history`, null, staffToken);
    const baselineCount = baselineHistoryRes.data.clearedTodayCount || 0;

    const clear1 = await request('POST', `/queue/${join1.data._id}/complete`, null, staffToken);
    if (clear1.status !== 200 || clear1.data.status !== 'COMPLETED' || !clear1.data.completedAt) {
        throw new Error(`Failed to clear table for party 1: ${JSON.stringify(clear1.data)}`);
    }
    console.log(`✅ Party 1 table cleared: ${clear1.data.tokenLabel} with completedAt timestamp`);

    // Verify Party 1 in MongoDB
    const dbEntry1 = await QueueEntry.findById(join1.data._id);
    if (dbEntry1.status !== 'COMPLETED' || !dbEntry1.completedAt || dbEntry1.partySize !== 4) {
        throw new Error(`MongoDB record verification failed for party 1: ${JSON.stringify(dbEntry1)}`);
    }
    console.log(`✅ Party 1 verified in MongoDB: status=COMPLETED, completedAt=${dbEntry1.completedAt.toISOString()}, partySize=4`);

    // 11. Fetch History and check clearedTodayCount increment
    const historyRes1 = await request('GET', `/queue/service/${serviceId}/history?tz=Asia/Kolkata`, null, staffToken);
    if (historyRes1.status !== 200) {
        throw new Error(`Failed to fetch history: ${JSON.stringify(historyRes1.data)}`);
    }
    const { history: histList1, clearedTodayCount: count1 } = historyRes1.data;
    if (count1 !== baselineCount + 1) {
        throw new Error(`Expected clearedTodayCount to be ${baselineCount + 1}, got ${count1}`);
    }
    const foundCleared1 = histList1.find(e => e._id.toString() === join1.data._id.toString());
    if (!foundCleared1 || !foundCleared1.completedAt || foundCleared1.partySize !== 4) {
        throw new Error('Party 1 not found or incomplete in history response');
    }
    console.log(`✅ Party 1 verified in recent history and clearedTodayCount accurately incremented by +1 (${baselineCount} -> ${count1})`);

    // 12. Clear Table for Party 2 -> Multiple cleared parties increment count correctly
    const clear2 = await request('POST', `/queue/${join2.data._id}/complete`, null, staffToken);
    if (clear2.status !== 200 || clear2.data.status !== 'COMPLETED') {
        throw new Error('Clear party 2 failed');
    }
    const historyRes2 = await request('GET', `/queue/service/${serviceId}/history`, null, staffToken);
    const count2 = historyRes2.data.clearedTodayCount;
    if (count2 !== baselineCount + 2) {
        throw new Error(`Expected clearedTodayCount to be ${baselineCount + 2}, got ${count2}`);
    }
    console.log(`✅ Clearing multiple parties increments count correctly (${count1} -> ${count2})`);

    // 13. Verify pagination limit does NOT affect clearedTodayCount
    const limitedHistoryRes = await request('GET', `/queue/service/${serviceId}/history?limit=1`, null, staffToken);
    if (limitedHistoryRes.data.history.length !== 1) {
        throw new Error(`Expected history length 1 with limit=1, got ${limitedHistoryRes.data.history.length}`);
    }
    if (limitedHistoryRes.data.clearedTodayCount !== count2) {
        throw new Error(`Pagination limit affected clearedTodayCount! Expected ${count2}, got ${limitedHistoryRes.data.clearedTodayCount}`);
    }
    console.log(`✅ Pagination limit (limit=1) preserves full daily count: history.length=1, clearedTodayCount=${count2}`);

    // 14. Verify entries completed on a previous day do NOT count toward today's metric
    const yesterdayDate = new Date(Date.now() - 48 * 3600 * 1000); // 2 days ago
    const yesterdayEntry = await QueueEntry.create({
        serviceId,
        userId: join3.data.userId,
        tokenNumber: 999,
        tokenLabel: 'Y-999',
        status: 'COMPLETED',
        completedAt: yesterdayDate,
        partySize: 2
    });

    const checkYesterdayRes = await request('GET', `/queue/service/${serviceId}/history`, null, staffToken);
    if (checkYesterdayRes.data.clearedTodayCount !== count2) {
        throw new Error(`Yesterday's entry was incorrectly counted towards today's count! Expected ${count2}, got ${checkYesterdayRes.data.clearedTodayCount}`);
    }
    console.log(`✅ Entry completed 2 days ago correctly excluded from clearedTodayCount (${checkYesterdayRes.data.clearedTodayCount})`);

    // 15. Clean up test entries
    await QueueEntry.deleteMany({ _id: { $in: [join1.data._id, join2.data._id, join3.data._id, yesterdayEntry._id] } });
    await User.deleteMany({ email: { $in: [staffEmail, customerEmail1, customerEmail2, customerEmail3] } });
    await mongoose.disconnect();

    console.log('\n========================================================');
    console.log('   ALL HOST DASHBOARD BACKEND TESTS PASSED (15/15)   ');
    console.log('========================================================');
}

runDashboardTests().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
