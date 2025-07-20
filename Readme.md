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

## Installation

- npm i jacksdb

```ts
import jacksdb from "jacksdb"; // or from your relative path

const { JacksDB, Schema } = jacksdb;
```

## Define a Schema

You must define a schema using Schema before using a collection:

```ts
const userSchema = new Schema({
  id: Number,
  name: String,
  age: Number,
  tags: [String],
  meta: {
    city: String,
    active: Boolean,
  },
});
```

## Initialize JacksDB

```ts
const db = new JacksDB("your-secret-key"); // secret-key optional
```

## Create Collections

```ts
const users = db.collection("users", userSchema); // Collection name and schema
```

## Insert Data

- insertOne(doc: object)

```ts
await users.insertOne({
  id: 1,
  name: "Alice",
  age: 30,
  tags: ["engineer", "blogger"],
  meta: { city: "Delhi", active: true },
});
```

- insertMany(docs: object[])

```ts
await users.insertMany([
  {
    id: 2,
    name: "Bob",
    age: 25,
    tags: ["coder"],
    meta: { city: "Mumbai", active: false },
  },
  {
    id: 3,
    name: "Charlie",
    age: 35,
    tags: ["dev"],
    meta: { city: "Delhi", active: true },
  },
]);
```

## Find Documents

- find(query, options?)

```ts
const result = await users.find({ age: 30 });
```

Optional query options:

```ts
await users.find(
  {},
  {
    sort: { age: -1 },
    skip: 10,
    limit: 5,
  }
);
```

- findOne(query)

```ts
const user = await users.findOne({ name: "Alice" });
```

## Update Documents

- updateOne(filter, update)

```ts
await users.updateOne({ id: 1 }, { name: "Mona", age: 31 });
```

- updateMany(filter, update)

```ts
await users.updateMany({ tags: "blogger" }, { "meta.active": false });
```

## Delete Documents

- deleteOne(query)

```ts
await users.deleteOne({ name: "Mona" });
```

- deleteMany(query)

```ts
await users.deleteMany({ "meta.city": "Delhi" });
```

## Supported Query Operators

| Operator  | Usage Example                                                 | Description           |
| --------- | ------------------------------------------------------------- | --------------------- |
| `$eq`     | `{ age: { $eq: 30 } }`                                        | Equal to              |
| `$ne`     | `{ name: { $ne: "Bob" } }`                                    | Not equal to          |
| `$gt`     | `{ age: { $gt: 25 } }`                                        | Greater than          |
