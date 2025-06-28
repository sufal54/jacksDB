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
const [value, unlock] = await lock.reads();

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
