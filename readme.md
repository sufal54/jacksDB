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
import { Database } from "./engine/Database/Database";
import Schema from "./engine/schema/schema";

// 1. Define schema
const schema = new Schema({
  id: Number,
  name: String,
  age: Number,
  tags: [String],
  meta: {
    city: String,
    active: Boolean,
  },
});

// 2. Create DB instance
const db = new Database("usersdb", schema, "my-secret-password");

// 3. Access collection
const users = db.collection("users");

// 4. Insert
await users.insertOne({
  id: 1,
  name: "Alice",
  age: 30,
  tags: ["engineer", "blogger"],
  meta: { city: "Delhi", active: true },
});

// 5. Find
const result = await users.find({ age: 30 });
console.log(result);

// 6. Update
await users.updateOne({ id: 1 }, { age: 31 });

// 7. Delete
await users.deleteOne({ id: 1 });
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
