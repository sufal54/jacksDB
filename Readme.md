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
