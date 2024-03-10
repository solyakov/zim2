const DB_NAME = 'app-db';
const DB_VERSION = 1;
const OBJECT_STORE_NAME = 'changes';
const BATCH_API_URL = '/api/v1/batch';
const BATCH_MAX_ITEMS = 10;
const BATCH_INTERVAL = 1000;
const POST_STATUS_INTERVAL = 1000;
const SYNC_CHECK_INTERVAL = 100;
const WAIT_CHECK_INTERVAL = 100;
const READ_ONLY = 'readonly';
const READ_WRITE = 'readwrite';
const STATUS_MESSAGE_TYPE = 'status';
const CHANGE_MESSAGE_TYPE = 'change';
const SYNC_MESSAGE_TYPE = 'sync';

const openRequest = indexedDB.open(DB_NAME, DB_VERSION);
let db;

openRequest.onerror = (ev) => {
    console.error(`Opening database failed: ${ev.target.errorCode}`);
};

openRequest.onblocked = () => {
    console.error('Opening database failed: blocked by another connection.');
};

openRequest.onupgradeneeded = (ev) => {
    const upgradeDB = ev.target.result;
    if (!upgradeDB.objectStoreNames.contains(OBJECT_STORE_NAME)) {
        upgradeDB.createObjectStore(OBJECT_STORE_NAME, { autoIncrement: true });
    }
};

openRequest.onsuccess = async (ev) => {
    db = ev.target.result;
    await periodicallySubmitChanges();
    await periodicallyPostStatus();
};

function saveChangeToDB(change) {
    const transaction = db.transaction([OBJECT_STORE_NAME], READ_WRITE);
    const objectStore = transaction.objectStore(OBJECT_STORE_NAME);
    return new Promise((resolve, reject) => {
        const request = objectStore.add(change);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function deleteChangesFromDB(keys) {
    const transaction = db.transaction([OBJECT_STORE_NAME], READ_WRITE);
    const objectStore = transaction.objectStore(OBJECT_STORE_NAME);
    return Promise.all(keys.map((key) => {
        return new Promise((resolve, reject) => {
            const request = objectStore.delete(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }));
}

function aggregateBatchChanges(batch) {
    const result = {/*
        "/some/page": {
            ops: [
                { insert: "Text", attributes: { bold: true } }
            ],
            version: 1
        },
        "/another/page": {
            ops: [
                { insert: "Text", attributes: { bold: true } }
            ],
            version: 1
        }
    */};
    for (const { page, ops, version } of batch) {
        if (!result[page]) {
            result[page] = { ops, version };
            continue;
        }
        if (result[page].version !== version - 1) {
            // Every new change should have a version that is exactly one greater than the previous one.
            throw new Error(`Version mismatch for page ${page}`);
        }
        result[page].version = version; // The version of the last change (changes are applied in order).
        result[page].ops.push(...ops);
    }
    return result;
}

function countPendingChanges() {
    const transaction = db.transaction([OBJECT_STORE_NAME], READ_ONLY);
    const store = transaction.objectStore(OBJECT_STORE_NAME);
    return new Promise((resolve, reject) => {
        const request = store.count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function periodicallyPostStatus() {
    try {
        const status = {
            pendingChanges: await countPendingChanges()
        };
        const clients = await self.clients.matchAll();
        for (const client of clients) {
            client.postMessage({ type: STATUS_MESSAGE_TYPE, status });
        }
    } catch (e) {
        console.error(`Posting status failed: ${e}`);
    } finally {
        setTimeout(periodicallyPostStatus, POST_STATUS_INTERVAL);
    }
}

async function periodicallySubmitChanges() {
    try {
        while (1 /* Until all pending changes are submitted. */) {
            const transaction = db.transaction([OBJECT_STORE_NAME], READ_ONLY);
            const store = transaction.objectStore(OBJECT_STORE_NAME);
            const batch = await new Promise((resolve, reject) => {
                const request = store.openCursor();
                const records = [/*
                    {
                        page: "/some/page",
                        ops: [
                            { insert: "Text", attributes: { bold: true } }
                        ],
                        version: 1,
                        key: 1
                    }
                */];
                request.onsuccess = (ev) => {
                    const cursor = ev.target.result;
                    if (!cursor) {
                        resolve(records);
                        return;
                    }
                    records.push({
                        page: cursor.value.page,
                        ops: cursor.value.ops,
                        version: cursor.value.version,
                        key: cursor.key
                    });
                    if (records.length === BATCH_MAX_ITEMS) {
                        resolve(records);
                        return;
                    }
                    cursor.continue();
                }
                request.onerror = () => reject(request.error);
            });

            if (batch.length === 0) {
                // No pending changes.
                break;
            }

            const response = await fetch(BATCH_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    changes: aggregateBatchChanges(batch)
                })
            });

            if (!response.ok) {
                throw new Error(response.statusText);
            }

            await deleteChangesFromDB(batch.map(({ key }) => key));
        }
    } catch (e) {
        console.error(`Submitting changes failed: ${e}`);
    } finally {
        setTimeout(periodicallySubmitChanges, BATCH_INTERVAL);
    }
}

async function processChangeRequest(ev) {
    let error = null;
    try {
        await saveChangeToDB({
            page: ev.data.change.page,
            ops: ev.data.change.ops,
            version: ev.data.change.version
        });
    } catch (e) {
        error = e.message;
    }
    ev.ports[0].postMessage({ error });
}

async function ensureChangesSynced(ev) {
    let error = null;
    try {
        const pending = await countPendingChanges();
        if (pending > 0) {
            setTimeout(() => ensureChangesSynced(ev), SYNC_CHECK_INTERVAL);
            return;
        }
    } catch (e) {
        error = e.message
    }
    ev.ports[0].postMessage({ error });
}

function waitForDBInitialization() {
    return new Promise((resolve) => {
        function check() {
            if (db) {
                resolve();
                return;
            }
            setTimeout(check, WAIT_CHECK_INTERVAL);
        }
        check();
    });
}

self.onmessage = async (ev) => {
    await waitForDBInitialization();
    const type = ev.data.type;
    switch (type) {
        case CHANGE_MESSAGE_TYPE:
            await processChangeRequest(ev);
            break;
        case SYNC_MESSAGE_TYPE:
            await ensureChangesSynced(ev);
            break;
        default:
            console.error(`Unknown message type: ${type}`);
    }
};

self.oninstall = (ev) => {
    ev.waitUntil(self.skipWaiting());
};

self.onactivate = (ev) => {
    ev.waitUntil(self.clients.claim());
};
