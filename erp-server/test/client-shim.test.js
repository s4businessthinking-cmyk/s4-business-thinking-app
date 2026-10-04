// End-to-end: the app's Firebase-compatible client (src/backend) against a live server.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "../src/app.js";

let app;
let fs;
let au;

const waitFor = async (fn, ms = 3000) => {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - start > ms) throw new Error("timeout");
    await new Promise((r) => setTimeout(r, 20));
  }
};

before(async () => {
  app = await startServer({
    production: false,
    host: "127.0.0.1",
    port: 0,
    dbDriver: "sqlite",
    sqlitePath: ":memory:",
    jwtSecret: "test-secret-test-secret-test-secret-123",
    idTokenTtlSec: 3600,
    refreshTokenTtlSec: 3600,
    maxBodyBytes: 1024 * 1024,
    trustProxy: false,
  });
  globalThis.S4_API_URL = `http://127.0.0.1:${app.port}`;
  au = await import("../../src/backend/auth.js");
  fs = await import("../../src/backend/firestore.js");
});

after(async () => {
  await au.signOut(au.getAuth());
  await new Promise((r) => setTimeout(r, 50));
  await app.close();
});

test("client shim: auth, writes, queries, transactions, realtime", async () => {
  const auth = au.getAuth();
  const db = fs.getFirestore();
  const { collection, doc, query, where, orderBy, limit, onSnapshot, addDoc, updateDoc, deleteDoc, setDoc, getDoc, getDocs, runTransaction, writeBatch, serverTimestamp, increment } = fs;

  const states = [];
  const stopAuth = au.onAuthStateChanged(auth, (u) => states.push(u?.uid || null));

  await assert.rejects(au.signInWithEmailAndPassword(auth, "none@x.com", "secret1"), { code: "auth/invalid-credential" });
  const cred = await au.createUserWithEmailAndPassword(auth, "owner@shop.com", "secret1");
  const uid = cred.user.uid;
  assert.equal(auth.currentUser.uid, uid);
  await waitFor(() => states.includes(uid));

  const provisioner = au.getSecondaryAuth("prov");
  const staff = await au.createUserWithEmailAndPassword(provisioner, "staff@shop.com", "secret2");
  assert.notEqual(staff.user.uid, uid);
  assert.equal(auth.currentUser.uid, uid, "creating staff must not switch the owner session");

  await setDoc(doc(db, "users", uid), { shopId: "s1", role: "owner", createdAt: serverTimestamp() });
  await setDoc(doc(db, "shops", "s1"), { ownerUid: uid, companyName: "S4", lastSISerial: 0 });
  const userSnap = await getDoc(doc(db, "users", uid));
  assert.ok(userSnap.exists());
  assert.match(userSnap.data().createdAt, /^\d{4}-\d{2}-\d{2}T/);

  const seen = [];
  const stop = onSnapshot(query(collection(db, "products"), where("shopId", "==", "s1"), orderBy("name")), (snap) => {
    seen.push({ names: snap.docs.map((d) => d.data().name), changes: snap.docChanges().map((c) => c.type) });
  });
  const shopSeen = [];
  const stopShop = onSnapshot(doc(db, "shops", "s1"), (snap) => shopSeen.push(snap.data()?.lastSISerial));

  await waitFor(() => seen.length >= 1);
  assert.deepEqual(seen[0].names, []);

  const batch = writeBatch(db);
  batch.set(doc(db, "products", "b"), { shopId: "s1", name: "Bearing", code: "B1", stock: 5 });
  batch.set(doc(db, "products", "a"), { shopId: "s1", name: "Axle", code: "A1", stock: 1 });
  await batch.commit();
  await waitFor(() => seen.at(-1).names.length === 2);
  assert.deepEqual(seen.at(-1).names, ["Axle", "Bearing"]);

  const added = await addDoc(collection(db, "products"), { shopId: "s1", name: "Clutch", code: "C1" });
  assert.equal(added.id.length, 20);
  await updateDoc(doc(db, "products", "a"), { stock: increment(4) });
  await waitFor(() => seen.at(-1).names.length === 3);
  assert.equal((await getDoc(doc(db, "products", "a"))).data().stock, 5);

  await deleteDoc(doc(db, "products", "b"));
  await waitFor(() => seen.at(-1).names.join() === "Axle,Clutch");
  assert.deepEqual(seen.at(-1).changes, ["removed"]);

  const limited = await getDocs(query(collection(db, "products"), where("shopId", "==", "s1"), orderBy("name"), limit(1)));
  assert.deepEqual(limited.docs.map((d) => d.id), ["a"]);

  const serials = await Promise.all(
    [1, 2, 3, 4].map(() =>
      runTransaction(db, async (tx) => {
        const s = await tx.get(doc(db, "shops", "s1"));
        const next = Number(s.data().lastSISerial || 0) + 1;
        tx.update(doc(db, "shops", "s1"), { lastSISerial: next });
        return next;
      })
    )
  );
  assert.deepEqual([...serials].sort(), [1, 2, 3, 4], "concurrent transactions must hand out unique serials");
  await waitFor(() => shopSeen.at(-1) === 4);

  assert.equal((await getDocs(query(collection(db, "products"), where("shopId", "==", "other")))).size, 0);

  stop();
  stopShop();
  stopAuth();
});

test("client backup: gzip export file restores through the app's backup service", async () => {
  const db = fs.getFirestore();
  const { readBackupFile, restoreShopBackup } = await import("../../src/backup/backupService.js");

  const backup = await fs.callServer("/v1/backup/export", { shopId: "s1" });
  const gz = new Uint8Array(await new Response(new Blob([JSON.stringify(backup)]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
  const parsed = await readBackupFile(new Blob([gz]));
  assert.equal(parsed.shopId, "s1");
  assert.equal(parsed.counts.products, 2);

  await fs.updateDoc(fs.doc(db, "products", "a"), { name: "Changed" });
  const result = await restoreShopBackup(parsed);
  assert.equal(result.restored, 1);
  assert.equal((await fs.getDoc(fs.doc(db, "products", "a"))).data().name, "Axle");

  await assert.rejects(readBackupFile(new Blob(["not a backup"])), /invalid-backup-file/);
});
