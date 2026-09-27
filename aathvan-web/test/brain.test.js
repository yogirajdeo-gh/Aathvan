// Run with: TZ=Asia/Kolkata node --test test/
const test = require("node:test");
const assert = require("node:assert/strict");
const B = require("../brain.js");

const now = new Date(2026, 8, 27, 10); // Sunday 27 Sep 2026, 10:00
const yesterday = new Date(now.getTime() - 86400000).toISOString();
const mem = (text, extra = {}) => ({ id: "id-" + text.slice(0, 12) + Math.random(), text, createdAt: yesterday, due: null, done: false, doneAt: null, ...extra });
const run = (text, mems = []) => B.respond(text, mems, now);

test("keys match across scripts", () => {
  assert.equal(B.key("दूध"), B.key("doodh"));
  assert.equal(B.key("doodh"), B.key("dudh"));
  assert.equal(B.key("राहुल"), B.key("Rahul"));
});

test("save English with date", () => {
  const p = run("Remember: car insurance renews on 12 October");
  assert.equal(p.add.text, "Car insurance renews on 12 October");
  assert.equal(p.add.due, "2026-10-12");
  assert.equal(p.lang, "en");
});

test("save Marathi tomorrow", () => {
  const p = run("आईच्या गोळ्या उद्या आणायच्या आहेत");
  assert.equal(p.add.text, "आईच्या गोळ्या उद्या आणायच्या आहेत");
  assert.equal(p.add.due, "2026-09-28");
  assert.equal(p.lang, "mr");
});

test("save Hindi strips command", () => {
  const p = run("याद रखना, राहुल को 5000 रुपये उधार दिए");
  assert.equal(p.add.text, "राहुल को 5000 रुपये उधार दिए");
  assert.equal(p.add.due, null);
  assert.equal(p.lang, "hi");
});

test("Roman Hindi with trailing command", () => {
  const p = run("Rahul ko 5000 rupaye udhar diye yaad rakhna");
  assert.equal(p.add.text, "Rahul ko 5000 rupaye udhar diye");
});

test("Roman Marathi weekday", () => {
  assert.ok(run("shukravari bank madhe jaycha aahe lakshat thev").add);
  assert.equal(run("somvar la doctor appointment").add.due, "2026-09-28");
});

test("call is not kal", () => {
  const p = run("call the plumber about the leak");
  assert.ok(p.add);
  assert.equal(p.add.due, null);
});

test("amounts are not dates", () => assert.equal(run("Gave 5000 to Rahul").add.due, null));

test("list everything", () => {
  const mems = [mem("Buy milk"), mem("Old thing", { done: true })];
  assert.deepEqual(run("What did I ask you to remember?", mems).refs, [mems[0].id]);
});

test("Marathi list everything", () => {
  const mems = [mem("Buy milk")];
  const p = run("मी काय लक्षात ठेवायला सांगितलं होतं?", mems);
  assert.deepEqual(p.refs, [mems[0].id]);
  assert.equal(p.lang, "mr");
});

test("Roman Hindi query finds Devanagari note", () => {
  const mems = [mem("राहुल को 5000 रुपये उधार दिए"), mem("Car insurance renews on 12 October")];
  assert.deepEqual(run("Rahul ko kitne paise diye?", mems).refs, [mems[0].id]);
});

test("Marathi query finds Roman note", () => {
  const mems = [mem("Rahul ko 5000 rupaye udhar diye"), mem("Pay rent")];
  assert.deepEqual(run("राहुल ला किती पैसे दिले?", mems).refs, [mems[0].id]);
});

test("concepts match across languages", () => {
  const mems = [mem("आईच्या गोळ्या उद्या आणायच्या आहेत"), mem("Pay rent")];
  assert.deepEqual(run("when do I need to get mom's medicine?", mems).refs, [mems[0].id]);
});

test("tomorrow query", () => {
  const mems = [mem("Dentist", { due: "2026-09-28" }), mem("Tax", { due: "2026-10-05" })];
  assert.deepEqual(run("what do I have tomorrow?", mems).refs, [mems[0].id]);
});

test("not found", () => {
  const p = run("where did I keep the passport?", [mem("Buy milk")]);
  assert.deepEqual(p.refs, []);
  assert.equal(p.add, undefined);
});

test("done list query", () => {
  const mems = [mem("Buy milk", { done: true }), mem("Pay rent")];
  assert.deepEqual(run("what have I completed?", mems).refs, [mems[0].id]);
});

test("complete Marathi", () => {
  const mems = [mem("आईच्या गोळ्या उद्या आणायच्या आहेत"), mem("Pay rent")];
  assert.deepEqual(run("आईच्या गोळ्या आणल्या, झालं", mems).complete, [mems[0].id]);
});

test("complete English", () => {
  const mems = [mem("Car insurance renews on 12 October"), mem("Buy milk")];
  assert.deepEqual(run("paid the insurance", mems).complete, [mems[0].id]);
});

test("complete Hindi Roman", () => {
  const mems = [mem("Electricity bill bharna hai"), mem("Buy milk")];
  assert.deepEqual(run("bijli ka bill bhar diya", mems).complete, [mems[0].id]);
});

test("future task with done word is saved", () => {
  const p = run("Submit the tax form by Friday", [mem("Buy milk")]);
  assert.equal(p.add.due, "2026-10-02");
});

test("reopen", () => {
  const mems = [mem("Buy milk", { done: true })];
  assert.deepEqual(run("milk not done", mems).reopen, [mems[0].id]);
});

test("never deletes", () => {
  const mems = [mem("Buy milk")];
  const p = run("delete the milk one", mems);
  assert.equal(p.add, undefined);
  assert.deepEqual(p.complete, []);
  assert.deepEqual(p.refs, [mems[0].id]);
});

test("greeting", () => assert.equal(run("namaskar").add, undefined));
