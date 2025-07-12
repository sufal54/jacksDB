# 🧩 JacksDB – Encrypted JSON Document Database

**JacksDB** is a secure, local-first, file-based document database built in TypeScript. It uses AES-256-CBC encryption, per-field indexing (including nested fields), and MongoDB-style APIs for inserting, querying, updating, and deleting documents — all from the filesystem, with no external dependencies.

---

## 📦 Features

- 🧩 MongoDB-style API (`insertOne`, `insertMany`, `find`, `updateOne`, `deleteOne`, etc.)
- 🔐 AES-256 encrypted storage
- 🗂️ Per-field and nested key indexing
- ⚡ Efficient in-place updates (if new data fits)
- 🧼 Background-safe deletion with `removeGarbage()`
- 📁 Fully file-based – no server required

---

## ✅ Usage

```ts
import { JacksDB, Schema } from "../jacksdb/JacksDB";
import assert from "node:assert";

(async function testDB() {
  // 🧩 1. Define the schema for the collection
  const userSchema = new Schema({
    id: Number,
    name: String,
    age: Number,
    tags: [String], // Array of strings
    meta: {
      city: String,
      active: Boolean,
    },
  });

  // 🔐 2. Create a new JacksDB instance with a secret encryption key
  const db = new JacksDB("secret-key");

  // 📦 3. Access or create a collection with the defined schema
  const users = db.collection("users", userSchema);

  // 📝 4. Prepare some user documents to insert
  const data = [
    {
      id: 1,
      name: "Alice",
      age: 30,
      tags: ["engineer", "blogger"],
      meta: { city: "Delhi", active: true },
    },
    {
      id: 2,
      name: "Bob",
      age: 25,
      tags: ["coder", "blogger"],
      meta: { city: "Mumbai", active: false },
    },
    {
      id: 3,
      name: "Charlie",
      age: 30,
      tags: ["engineer", "designer"],
      meta: { city: "Delhi", active: true },
    },
  ];

  // ➕ 5. Insert multiple documents
  await users.insertMany(data);
  console.log("✅ Inserted users");

  // 🔍 6. Query users with age = 30
  const age30 = await users.find({ age: 30 });
  console.log("🔎 Query: { age: 30 } =>", age30);
  console.assert(age30.length === 2);
  console.log("✅ Found users with age 30");

  // 🔍 7. Query users who have the tag "blogger"
  const bloggers = await users.find({ tags: "blogger" });
  console.log("🔎 Query: { tags: 'blogger' } =>", bloggers);
  console.assert(bloggers.length === 2);
  console.log("✅ Found users with tag 'blogger'");

  // 🔍 8. Query users in the city "Delhi"
  const delhiUsers = await users.find({ "meta.city": "Delhi" });
  console.log("🔎 Query: { 'meta.city': 'Delhi' } =>", delhiUsers);
  console.assert(delhiUsers.length === 2);
  console.log("✅ Found users in Delhi");

  // 🛠️ 9. Update one user (id = 1) to name = Mona, age = 35
  await users.updateOne({ id: 1 }, { name: "Mona", age: 35 });
  const updatedMona = await users.find({ name: "Mona" });
  console.log(
    "🔄 After updateOne({ id: 1 }, { name: 'Mona', age: 35 }) =>",
    updatedMona
  );
  console.assert(updatedMona[0].age === 35);
  console.log("✅ Updated Alice to Mona and changed age");

  // 🛠️ 10. Update all users with tag "blogger" to set meta.active = false
  await users.updateMany({ tags: "blogger" }, { "meta.active": false });
  const allBloggers = await users.find({ tags: "blogger" });
  console.log("🔄 Bloggers after updateMany =>", allBloggers);
  for (const u of allBloggers) {
    console.assert(u.meta.active === false);
  }
  console.log("✅ All bloggers marked inactive");

  // ❌ 11. Delete one user (Mona)
  await users.deleteOne({ name: "Mona" });
  const afterDeleteOne = await users.find({});
  console.log("🗑️ After deleteOne({ name: 'Mona' }) =>", afterDeleteOne);
  console.assert(afterDeleteOne.length === 2);
  console.log("✅ Deleted one user (Mona)");

  // ❌ 12. Delete all users from Delhi
  await users.deleteMany({ "meta.city": "Delhi" });
  const remaining = await users.find({});
  console.log("🗑️ Remaining users after deleteMany =>", remaining);
  console.assert(remaining.length === 1);
  console.assert(remaining[0].name === "Bob");
  console.log("✅ Deleted all users from Delhi");

  // 🧪 Final assertion
  console.log("🎉 All tests passed!");
})();
```

| Operation         | Time Complexity                 | Description                     |
| ----------------- | ------------------------------- | ------------------------------- |
| `insertOne()`     | O(1 + f)                        | `f` = number of indexed fields  |
| `find()`          | O(1) with index, O(n) full scan | Uses indexes if available       |
| `updateOne()`     | O(f)                            | Clean + reindex affected fields |
| `deleteOne()`     | O(f)                            | Clean index entries             |
| `insertMany()`    | O(k × f)                        | `k` = number of documents       |
| `updateMany()`    | O(n × f)                        | For each matched document       |
| `deleteMany()`    | O(n × f)                        | Same as updateMany              |
| `fullScan()`      | O(n)                            | Streamed read of all documents  |
| `removeGarbage()` | O(n)                            | Rewrites only valid blocks      |
