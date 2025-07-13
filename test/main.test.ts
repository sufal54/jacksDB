import { JacksDB, Schema } from "../src/index";
import assert from "node:assert";

(async function testDB() {
  const userSchema = new Schema({
    id: Number,
    name: String,
    age: Number,
    tags: [String],
    meta: {
      city: String,
      active: Boolean
    }
  });

  const db = new JacksDB("secret-key");
  const users = db.collection("users", userSchema);

  // Clean up any existing data
  // await users.deleteMany({}); // Optional: add `deleteAll` if supported

  // Insert many
  const data = [
    { id: 1, name: "Alice", age: 30, tags: ["engineer", "blogger"], meta: { city: "Delhi", active: true } },
    { id: 2, name: "Bob", age: 25, tags: ["coder", "blogger"], meta: { city: "Mumbai", active: false } },
    { id: 3, name: "Charlie", age: 30, tags: ["engineer", "designer"], meta: { city: "Delhi", active: true } },
    { id: 4, name: "David", age: 28, tags: ["tester"], meta: { city: "Kolkata", active: true } },
    { id: 5, name: "Eve", age: 32, tags: ["engineer"], meta: { city: "Delhi", active: false } },
  ];

  await users.insertMany(data);

  // insertOne
  await users.insertOne({ id: 6, name: "Frank", age: 27, tags: ["intern"], meta: { city: "Pune", active: true } });
  const frank = await users.find({ name: "Frank" });
  assert.strictEqual(frank.length, 1);
  assert.strictEqual(frank[0].meta.city, "Pune");

  // find
  const age30 = await users.find({ age: 30 });
  assert.strictEqual(age30.length, 2);

  const bloggers = await users.find({ tags: "blogger" });
  assert.strictEqual(bloggers.length, 2);

  const delhiUsers = await users.find({ "meta.city": "Delhi" });
  assert.strictEqual(delhiUsers.length, 3);

  // find with sort
  const sorted = await users.find({ "meta.city": "Delhi" }, { sort: { age: 1 } });
  assert.deepStrictEqual(sorted.map(u => u.age), [30, 30, 32]);

  // find with skip
  const skipped = await users.find({ "meta.city": "Delhi" }, { sort: { age: 1 }, skip: 1 });
  assert.deepStrictEqual(skipped.map(u => u.age), [30, 32]);

  // find with limit
  const limited = await users.find({ "meta.city": "Delhi" }, { sort: { age: 1 }, limit: 2 });
  assert.strictEqual(limited.length, 2);

  // updateOne
  await users.updateOne({ id: 1 }, { name: "Alicia", age: 35 });
  const alicia = await users.find({ name: "Alicia" });
  assert.strictEqual(alicia[0].age, 35);

  // updateMany
  await users.updateMany({ tags: "engineer" }, { "meta.active": false });
  const engineers = await users.find({ tags: "engineer" });
  for (const u of engineers) assert.strictEqual(u.meta.active, false);

  // deleteOne
  await users.deleteOne({ name: "Bob" });
  const bobCheck = await users.find({ name: "Bob" });
  assert.strictEqual(bobCheck.length, 0);

  // deleteMany
  await users.deleteMany({ "meta.city": "Delhi" });
  const afterDelhiDelete = await users.find({ "meta.city": "Delhi" });
  assert.strictEqual(afterDelhiDelete.length, 0);

  console.log("All tests passed.");
})();