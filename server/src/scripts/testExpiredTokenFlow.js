require('dotenv').config();
const http = require('http');
const jwt = require('jsonwebtoken');
const path = require('path');
const { io } = require(path.resolve(__dirname, '../../../client/node_modules/socket.io-client'));

const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const PORT = process.env.PORT || 3000;

function request(method, path, token = null) {
    return new Promise((resolve, reject) => {
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const req = http.request({
            hostname: '127.0.0.1',
            port: PORT,
            path: `/api${path}`,
            method,
            headers
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsed = null;
                try { parsed = JSON.parse(data); } catch { parsed = data; }
                resolve({ status: res.statusCode, data: parsed });
            });
        });
        req.on('error', reject);
        req.end();
    });
}

function testSocketConnection(token) {
    return new Promise((resolve) => {
        const socket = io(`http://127.0.0.1:${PORT}`, {
            auth: { token },
            transports: ['websocket'],
            reconnection: false,
            timeout: 3000
        });

        socket.on('connect', () => {
            socket.disconnect();
            resolve({ connected: true, error: null });
        });

        socket.on('connect_error', (err) => {
            socket.disconnect();
            resolve({ connected: false, error: err.message });
        });
    });
}

async function run() {
    console.log('=== TESTING EXPIRED TOKEN REST & SOCKET FLOW ===\n');

    // 1. Create an expired token (expired 1 hour ago)
    const expiredToken = jwt.sign(
        { userId: '6ac547fc49a26f5700e59974', role: 'STAFF' },
        JWT_SECRET,
        { expiresIn: '-1h' }
    );

    // 2. Test REST with expired token
    const restRes = await request('GET', '/queue/services', expiredToken);
    console.log('1. REST GET /queue/services with expired token:');
    console.log('   Status:', restRes.status);
    console.log('   Body:', restRes.data);
    if (restRes.status !== 401) {
        throw new Error(`Expected REST 401, got ${restRes.status}`);
    }
    console.log('   ✅ REST correctly rejected expired token with 401 Unauthorized');

    // 3. Test Socket.IO with expired token
    const socketRes = await testSocketConnection(expiredToken);
    console.log('\n2. Socket.IO connection with expired token:');
    console.log('   Connected:', socketRes.connected);
    console.log('   Error:', socketRes.error);
    if (socketRes.connected || socketRes.error !== 'Invalid or expired token') {
        throw new Error(`Expected Socket.IO rejection with "Invalid or expired token", got: ${JSON.stringify(socketRes)}`);
    }
    console.log('   ✅ Socket.IO correctly rejected connection with "Invalid or expired token"');

    // 4. Test with valid token
    const validToken = jwt.sign(
        { userId: '6ac547fc49a26f5700e59974', role: 'STAFF' },
        JWT_SECRET,
        { expiresIn: '1h' }
    );

    const validRest = await request('GET', '/queue/services', validToken);
    console.log('\n3. REST GET /queue/services with valid token:');
    console.log('   Status:', validRest.status);
    if (validRest.status !== 200) {
        throw new Error(`Expected REST 200, got ${validRest.status}`);
    }
    console.log('   ✅ REST accepted valid token');

    const validSocket = await testSocketConnection(validToken);
    console.log('\n4. Socket.IO connection with valid token:');
    console.log('   Connected:', validSocket.connected);
    if (!validSocket.connected) {
        throw new Error(`Expected Socket.IO connect, got: ${JSON.stringify(validSocket)}`);
    }
    console.log('   ✅ Socket.IO accepted valid token');

    console.log('\n=== ALL SERVER AUTH TESTS PASSED ===');
}

run().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
