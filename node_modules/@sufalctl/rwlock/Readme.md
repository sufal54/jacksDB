# 🔐 RwLock<T> – TypeScript Read-Write Lock (Usage Guide)

A lightweight asynchronous read-write lock that allows:

- ✅ Multiple concurrent readers
- ✅ Exclusive single writer
- ✅ FIFO queuing
- ✅ Async/await support
- ✅ Safe access and mutation of any shared value

---

## 📦 Import

```ts
// Import the RwLock class from your implementation file
import RwLock from "./RwLock"; // adjust the path as needed

// Create a new lock with an initial value
const lock = new RwLock<number>(0);
// Acquire a read lock
const [value, unlock] = await lock.read();

// Use the value
console.log("Read value:", value);

// Release the read lock
unlock();

// Acquire a write lock (exclusive access)
const [value, done] = await lock.write();

// Use the value (read-only access, no mutation)
console.log("Got write lock with value:", value);

// Release the write lock
done();

// Acquire a write lock with intention to modify the value
const [oldValue, set] = await lock.setWrite();

// Log the current value
console.log("Previous value:", oldValue);

// Update the value and release the lock
set(oldValue + 1);
```

# 🗃 Using with fs.promises (Node.js File System)

You can use RwLock<FileHandle> to safely manage access to a file, ensuring no race conditions during concurrent reads or writes.

## 📦 Import

```ts
import fs from "node:fs/promises";
import RwLock from "./RwLock";

const filePath = "./example.txt";

// Open the file
const handle = await fs.open(filePath, "w+");

// Wrap the file handle with the RwLock
const fileLock = new RwLock(handle);

async function safeRead() {
  const [reader, unlock] = await fileLock.read();

  try {
    const { size } = await reader.stat();
    const buffer = Buffer.alloc(size);
    await reader.read(buffer, 0, size, 0);
    console.log("Read:", buffer.toString());
  } finally {
    unlock();
  }
}

async function safeWrite(content: string) {
  const [writer, done] = await fileLock.write();

  try {
    await writer.truncate(0); // Clear previous content
    await writer.writeFile(content);
    console.log("Wrote:", content);
  } finally {
    done();
  }
}

// Example
await safeWrite("Hello from RwLock!");
await safeRead();

await Promise.all([safeRead(), safeRead()]); // Optional concurrent reads

await safeWrite("New exclusive write");
await safeRead();

// Cleanup
await handle.close();
```
