/**
 * QueueLess Comprehensive Socket.IO Automated Test Suite
 * Tests 16 core requirements:
 * 1. Valid JWT connection
 * 2. Missing JWT rejection
 * 3. Invalid JWT rejection
 * 4. Expired JWT rejection
 * 5. User identity attachment (userId, role)
 * 6. Service room membership (join:service ack)
 * 7. Room validation (invalid serviceId rejected)
 * 8. Customer joins queue -> queue:joined & queue:updated emitted
 * 9. Call next customer -> queue:called & queue:updated emitted
 * 10. Start serving -> queue:started & queue:updated emitted
 * 11. Complete entry -> queue:completed & queue:updated emitted
 * 12. Cancel entry -> queue:cancelled & queue:updated emitted
 * 13. Event targeting isolation (room A does not receive room B events)
 * 14. Failed REST operation does NOT emit events
 * 15. Multiple connected clients (staff + customer simultaneous)
 * 16. Disconnect behavior & clean database state
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const User = require("../models/User");
const Organization = require("../models/Organization");
const Service = require("../models/Service");
const QueueEntry = require("../models/QueueEntry");

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const WS_URL = BASE_URL.replace(/^http/, "ws") + "/socket.io/?EIO=4&transport=websocket";

// Helper Socket.IO Client implemented via Node 22 native WebSocket
class TestSocketClient {
    constructor(token) {
        this.token = token;
        this.ws = null;
        this.connected = false;
        this.connectError = null;
        this.identity = null;
        this.eventListeners = new Map();
        this.ackCallbacks = new Map();
        this.ackCounter = 1;
        this.receivedEvents = [];
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(WS_URL);

            const timer = setTimeout(() => {
                reject(new Error("Connection timed out"));
            }, 5000);

            this.ws.onopen = () => {};

            this.ws.onmessage = (event) => {
                const data = String(event.data);

                // Engine.IO Open packet
                if (data.startsWith("0")) {
                    const authPayload = this.token ? { token: this.token } : {};
                    this.ws.send("40" + JSON.stringify(authPayload));
                }
                // Socket.IO CONNECT (Success)
                else if (data.startsWith("40")) {
                    this.connected = true;
                }
                // Socket.IO CONNECT_ERROR (Rejected)
                else if (data.startsWith("44")) {
                    try {
                        const errObj = JSON.parse(data.slice(2));
                        this.connectError = errObj;
                    } catch {
                        this.connectError = { message: data.slice(2) };
                    }
                    clearTimeout(timer);
                    resolve({ connected: false, error: this.connectError });
                }
                // Socket.IO EVENT (42[event, ...payload])
                else if (data.startsWith("42")) {
                    try {
                        const payloadStr = data.slice(2);
                        const parsed = JSON.parse(payloadStr);
                        const [eventName, ...args] = parsed;
                        const eventData = args.length === 1 ? args[0] : args;

                        if (eventName === "connected") {
                            this.identity = eventData;
                            clearTimeout(timer);
                            resolve({ connected: true, identity: eventData });
                        }

                        this.receivedEvents.push({ event: eventName, data: eventData });

                        const listeners = this.eventListeners.get(eventName) || [];
                        listeners.forEach((fn) => fn(eventData));
                    } catch (err) {
                        console.error("Error parsing event packet:", err);
                    }
                }
                // Socket.IO ACK (43<id>[response])
                else if (data.startsWith("43")) {
                    const match = data.match(/^43(\d+)(.*)$/);
                    if (match) {
                        const ackId = match[1];
                        const body = match[2];
                        try {
                            const parsed = JSON.parse(body);
                            const cb = this.ackCallbacks.get(ackId);
                            if (cb) {
                                this.ackCallbacks.delete(ackId);
                                cb(parsed[0]);
                            }
                        } catch (err) {
                            console.error("Error parsing ack:", err);
                        }
                    }
                }
            };

            this.ws.onerror = (err) => {
                clearTimeout(timer);
                reject(err);
            };

            this.ws.onclose = () => {
                this.connected = false;
            };
        });
    }

    emitWithAck(eventName, arg) {
        return new Promise((resolve, reject) => {
            if (!this.connected) return reject(new Error("Not connected"));
            const ackId = String(this.ackCounter++);
            this.ackCallbacks.set(ackId, resolve);
            const packet = `42${ackId}` + JSON.stringify([eventName, arg]);
            this.ws.send(packet);

            setTimeout(() => {
                if (this.ackCallbacks.has(ackId)) {
                    this.ackCallbacks.delete(ackId);
                    reject(new Error("Ack timeout for " + eventName));
                }
            }, 3000);
        });
    }

    waitForEvent(eventName, filter = null, timeoutMs = 4000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                const list = this.eventListeners.get(eventName) || [];
                const idx = list.indexOf(listener);
                if (idx !== -1) list.splice(idx, 1);
                reject(new Error(`Timeout waiting for event "${eventName}"`));
            }, timeoutMs);

            const listener = (data) => {
                if (filter && !filter(data)) {
                    return;
                }
                clearTimeout(timer);
                const list = this.eventListeners.get(eventName) || [];
                const idx = list.indexOf(listener);
                if (idx !== -1) list.splice(idx, 1);
                resolve(data);
            };

            if (!this.eventListeners.has(eventName)) {
                this.eventListeners.set(eventName, []);
            }
            this.eventListeners.get(eventName).push(listener);
        });
    }

    expectNoEvent(eventName, durationMs = 1200) {
        return new Promise((resolve, reject) => {
            const listener = (data) => {
                clearTimeout(timer);
                reject(new Error(`Unexpected event "${eventName}" received with payload: ${JSON.stringify(data)}`));
            };

            const timer = setTimeout(() => {
                const list = this.eventListeners.get(eventName) || [];
                const idx = list.indexOf(listener);
                if (idx !== -1) list.splice(idx, 1);
                resolve();
            }, durationMs);

            if (!this.eventListeners.has(eventName)) {
                this.eventListeners.set(eventName, []);
            }
            this.eventListeners.get(eventName).push(listener);
        });
    }

    close() {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            this.ws.close();
        }
    }
}

// REST fetch helper
async function api(method, endpoint, body = null, token = null) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`${BASE_URL}${endpoint}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : null
    });

    const data = await res.json().catch(() => null);
    return { status: res.status, data };
}

let passed = 0;
let failed = 0;

function assert(condition, testName, detail = "") {
    if (condition) {
        console.log(`  ✅ PASS: ${testName}`);
        passed++;
    } else {
        console.error(`  ❌ FAIL: ${testName} ${detail}`);
        failed++;
    }
}

async function runTestSuite() {
    console.log("==========================================");
    console.log("SOCKET.IO COMPREHENSIVE BACKEND TEST SUITE");
    console.log("==========================================\n");

    await mongoose.connect(process.env.MONGODB_URI);

    // Setup Test Data
    const testSuffix = Date.now().toString().slice(-6);
    const userEmail = `sockuser_${testSuffix}@example.com`;
    const staffEmail = `sockstaff_${testSuffix}@example.com`;
    const otherUserEmail = `otheruser_${testSuffix}@example.com`;

    // 1. Create Customer
    await api("POST", "/api/auth/register", {
        name: "Socket Customer",
        email: userEmail,
        password: "Password123"
    });
    const userLogin = await api("POST", "/api/auth/login", {
        email: userEmail,
        password: "Password123"
    });
    const userToken = userLogin.data.token;
    const userDecoded = jwt.decode(userToken);
    const userId = userDecoded.userId;

    // 2. Create Staff User
    await api("POST", "/api/auth/register", {
        name: "Socket Staff",
        email: staffEmail,
        password: "Password123"
    });
    await User.findOneAndUpdate({ email: staffEmail }, { role: "STAFF" });
    const staffLogin = await api("POST", "/api/auth/login", {
        email: staffEmail,
        password: "Password123"
    });
    const staffToken = staffLogin.data.token;
    const staffDecoded = jwt.decode(staffToken);
    const staffId = staffDecoded.userId;

    // 3. Create Other User
    await api("POST", "/api/auth/register", {
        name: "Other User",
        email: otherUserEmail,
        password: "Password123"
    });
    const otherLogin = await api("POST", "/api/auth/login", {
        email: otherUserEmail,
        password: "Password123"
    });
    const otherToken = otherLogin.data.token;

    // 4. Create Service A and Service B
    const org = await Organization.create({
        name: `Socket Test Org ${testSuffix}`
    });
    const serviceA = await Service.create({
        organizationId: org._id,
        name: `Service Alpha ${testSuffix}`,
        tokenPrefix: "A",
        avgServiceMinutes: 5,
        isActive: true
    });
    const serviceB = await Service.create({
        organizationId: org._id,
        name: `Service Beta ${testSuffix}`,
        tokenPrefix: "B",
        avgServiceMinutes: 5,
        isActive: true
    });

    const serviceIdA = serviceA._id.toString();
    const serviceIdB = serviceB._id.toString();

    console.log("--- 1. Authentication Tests ---");

    // Test 1: Valid JWT connection
    const client1 = new TestSocketClient(userToken);
    const conn1 = await client1.connect();
    assert(conn1.connected === true, "Valid JWT connection accepted");

    // Test 2: Missing JWT rejected
    const clientNoAuth = new TestSocketClient(null);
    const connNoAuth = await clientNoAuth.connect();
    assert(
        connNoAuth.connected === false &&
            (connNoAuth.error?.message === "Authentication required" || connNoAuth.error?.code === "UNAUTHORIZED"),
        "Missing JWT connection rejected"
    );

    // Test 3: Invalid JWT rejected
    const clientInvalid = new TestSocketClient("bogus.jwt.token");
    const connInvalid = await clientInvalid.connect();
    assert(
        connInvalid.connected === false &&
            connInvalid.error?.message === "Invalid or expired token",
        "Invalid JWT connection rejected"
    );

    // Test 4: Expired JWT rejected
    const expiredToken = jwt.sign(
        { userId, role: "USER" },
        process.env.JWT_SECRET,
        { expiresIn: "-10s" }
    );
    const clientExpired = new TestSocketClient(expiredToken);
    const connExpired = await clientExpired.connect();
    assert(
        connExpired.connected === false &&
            connExpired.error?.message === "Invalid or expired token",
        "Expired JWT connection rejected"
    );

    // Test 5: User identity attached to socket
    assert(
        conn1.identity?.userId === userId && conn1.identity?.role === "USER",
        "User identity correctly attached on connection",
        `Got: ${JSON.stringify(conn1.identity)}`
    );

    console.log("\n--- 2. Room Architecture & Subscription Tests ---");

    // Test 6: Service room membership (join:service ack)
    const joinAck = await client1.emitWithAck("join:service", serviceIdA);
    assert(
        joinAck?.success === true && joinAck?.room === `service:${serviceIdA}`,
        "Client joins service room with acknowledgement"
    );

    // Test 7: Room validation (invalid serviceId rejected)
    const badJoinAck = await client1.emitWithAck("join:service", "   ");
    assert(
        badJoinAck?.success === false && badJoinAck?.error === "Service ID is required",
        "Empty/invalid service ID rejected"
    );

    console.log("\n--- 3. Queue Lifecycle Event Tests ---");

    // Setup an isolated client in Service B room (to test event targeting isolation)
    const clientServiceB = new TestSocketClient(otherToken);
    await clientServiceB.connect();
    await clientServiceB.emitWithAck("join:service", serviceIdB);

    // Setup staff client in Service A room
    const clientStaff = new TestSocketClient(staffToken);
    await clientStaff.connect();
    await clientStaff.emitWithAck("join:service", serviceIdA);

    // Test 8: Customer joins queue -> queue:joined & queue:updated emitted
    const joinPromiseService = client1.waitForEvent("queue:joined");
    const updatePromiseService = client1.waitForEvent("queue:updated");
    const staffJoinPromise = clientStaff.waitForEvent("queue:joined");
    const isolatePromise = clientServiceB.expectNoEvent("queue:joined");

    const joinRes = await api("POST", "/api/queue/join", { serviceId: serviceIdA }, userToken);
    assert(joinRes.status === 201, "REST: Customer joins queue (201)");

    const [joinedEvt, updatedEvt, staffJoinedEvt] = await Promise.all([
        joinPromiseService,
        updatePromiseService,
        staffJoinPromise,
        isolatePromise
    ]);

    assert(
        joinedEvt?.entryId === joinRes.data._id &&
            joinedEvt?.serviceId === serviceIdA &&
            joinedEvt?.userId === userId &&
            joinedEvt?.tokenLabel === "A-001" &&
            joinedEvt?.status === "WAITING",
        "queue:joined event contains correct payload and fields",
        JSON.stringify(joinedEvt)
    );

    assert(
        updatedEvt?.serviceId === serviceIdA &&
            updatedEvt?.action === "JOINED" &&
            updatedEvt?.entry?.tokenLabel === "A-001",
        "queue:updated event emitted to service room with action JOINED"
    );

    assert(
        staffJoinedEvt?.entryId === joinRes.data._id,
        "Multiple clients in service room receive queue:joined simultaneously"
    );

    // Test 9: Call Next -> queue:called & queue:updated
    const callPromiseUser = client1.waitForEvent("queue:called");
    const callPromiseStaff = clientStaff.waitForEvent("queue:called");
    const callUpdatePromise = clientStaff.waitForEvent("queue:updated");

    const callRes = await api("POST", "/api/queue/call-next", { serviceId: serviceIdA }, staffToken);
    assert(callRes.status === 200, "REST: Staff calls next customer (200)");

    const [calledUserEvt, calledStaffEvt, calledUpdateEvt] = await Promise.all([
        callPromiseUser,
        callPromiseStaff,
        callUpdatePromise
    ]);

    assert(
        calledUserEvt?.status === "CALLED" &&
            calledUserEvt?.tokenLabel === "A-001" &&
            calledUserEvt?.userId === userId,
        "queue:called event received by customer in user room",
        JSON.stringify(calledUserEvt)
    );

    assert(
        calledStaffEvt?.status === "CALLED" && calledUpdateEvt?.action === "CALLED",
        "queue:called and queue:updated received in service room"
    );

    const entryId = joinRes.data._id;

    // Test 10: Start Serving -> queue:started & queue:updated
    const startPromiseUser = client1.waitForEvent("queue:started");
    const startUpdatePromise = clientStaff.waitForEvent("queue:updated");

    const startRes = await api("POST", `/api/queue/${entryId}/start`, {}, staffToken);
    assert(startRes.status === 200, "REST: Staff starts serving (200)");

    const [startedEvt, startUpdateEvt] = await Promise.all([
        startPromiseUser,
        startUpdatePromise
    ]);

    assert(
        startedEvt?.status === "SERVING" && startUpdateEvt?.action === "STARTED",
        "queue:started & queue:updated emitted with status SERVING"
    );

    // Test 11: Complete Entry -> queue:completed & queue:updated
    const completePromiseUser = client1.waitForEvent("queue:completed");
    const completeUpdatePromise = clientStaff.waitForEvent("queue:updated");

    const completeRes = await api("POST", `/api/queue/${entryId}/complete`, {}, staffToken);
    assert(completeRes.status === 200, "REST: Staff completes entry (200)");

    const [completedEvt, completeUpdateEvt] = await Promise.all([
        completePromiseUser,
        completeUpdatePromise
    ]);

    assert(
        completedEvt?.status === "COMPLETED" && completeUpdateEvt?.action === "COMPLETED",
        "queue:completed & queue:updated emitted with status COMPLETED"
    );

    // Test 12: Cancel Entry -> queue:cancelled & queue:updated
    // Customer joins again for cancel test
    const join2Promise = client1.waitForEvent("queue:joined");
    const joinRes2 = await api("POST", "/api/queue/join", { serviceId: serviceIdA }, userToken);
    assert(joinRes2.status === 201, "REST: Customer joins second time for cancel test");
    await join2Promise;
    const entryId2 = joinRes2.data._id;

    const cancelPromiseUser = client1.waitForEvent("queue:cancelled");
    const cancelUpdatePromise = clientStaff.waitForEvent("queue:updated", (d) => d.action === "CANCELLED");

    const cancelRes = await api("POST", `/api/queue/${entryId2}/cancel`, {}, userToken);
    assert(cancelRes.status === 200, "REST: Customer cancels own entry (200)");

    const [cancelledEvt, cancelUpdateEvt] = await Promise.all([
        cancelPromiseUser,
        cancelUpdatePromise
    ]);

    assert(
        cancelledEvt?.status === "CANCELLED" && cancelUpdateEvt?.action === "CANCELLED",
        "queue:cancelled & queue:updated emitted with status CANCELLED"
    );

    console.log("\n--- 4. Edge Cases & Isolation Tests ---");

    // Test 13: Event targeting isolation verified
    assert(
        true,
        "Targeting isolation verified (client in service B did not receive service A events)"
    );

    // Test 14: Failed REST operation does NOT emit events
    // Attempt duplicate join (which should return 409 and NOT emit any event)
    const joinRes3 = await api("POST", "/api/queue/join", { serviceId: serviceIdA }, userToken);
    assert(joinRes3.status === 201, "Customer joins fresh entry");

    const duplicateNoEventPromise = clientStaff.expectNoEvent("queue:joined", 1000);
    const dupRes = await api("POST", "/api/queue/join", { serviceId: serviceIdA }, userToken);
    assert(dupRes.status === 409, "REST: Duplicate active join rejected with 409");

    await duplicateNoEventPromise;
    assert(true, "No socket event emitted when REST operation fails (409 Conflict)");

    // Test 15: Multiple connected clients active
    assert(
        client1.connected && clientStaff.connected && clientServiceB.connected,
        "Multiple authenticated clients maintain concurrent socket sessions"
    );

    // Test 16: Disconnect behavior
    client1.close();
    clientStaff.close();
    clientServiceB.close();

    await new Promise((r) => setTimeout(r, 400));
    const activeEntriesAfterDisconnect = await QueueEntry.countDocuments({
        serviceId: serviceIdA,
        status: { $in: ["WAITING", "CALLED", "SERVING"] }
    });
    assert(
        activeEntriesAfterDisconnect === 1,
        "Disconnect does not affect database queue state"
    );

    console.log("\n--- Cleanup ---");
    await QueueEntry.deleteMany({ serviceId: { $in: [serviceIdA, serviceIdB] } });
    await Service.deleteMany({ _id: { $in: [serviceIdA, serviceIdB] } });
    await Organization.deleteOne({ _id: org._id });
    await User.deleteMany({ email: { $in: [userEmail, staffEmail, otherUserEmail] } });
    await mongoose.disconnect();
    console.log("Test data cleaned up successfully.");

    console.log("\n==========================================");
    console.log("TEST RESULTS");
    console.log("==========================================");
    console.log(`  ✅ PASSED: ${passed}`);
    console.log(`  ❌ FAILED: ${failed}`);
    console.log(`  TOTAL:    ${passed + failed}`);

    if (failed === 0) {
        console.log("\n  🎉 ALL 16 SOCKET.IO TESTS PASSED!");
        process.exit(0);
    } else {
        console.error("\n  ⚠️  SOME TESTS FAILED.");
        process.exit(1);
    }
}

runTestSuite().catch((err) => {
    console.error("Test runner error:", err);
    process.exit(1);
});
