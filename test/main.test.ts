import { JacksDB, Schema } from "../src/index";
import assert from "node:assert";

(async function testDB() {
  // Define the schema for the collection
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

  // Create JacksDB instance
  const db = new JacksDB("secret-key");

  // Get or create collection
  const users = db.collection("users", userSchema);

  // Remove old Datas
  await users.deleteMany({});

  // Prepare test data
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

  // Insert users
  await users.insertMany(data);
  console.log("Inserted users");

  // find() with filter
  const age30 = await users.find({ age: 30 });
  console.log("Query: { age: 30 } =>", age30);
  assert(age30.length === 2);
  console.log("Found users with age 30");

  // find() with array value matching
  const bloggers = await users.find({ tags: "blogger" });
  console.log("Query: { tags: 'blogger' } =>", bloggers);
  assert(bloggers.length === 2);
  console.log("Found users with tag 'blogger'");

  // find() with nested field query
  const delhiUsers = await users.find({ "meta.city": "Delhi" });
  console.log("Query: { 'meta.city': 'Delhi' } =>", delhiUsers);
  assert(delhiUsers.length === 2);
  console.log("Found users in Delhi");

  // updateOne()
  await users.updateOne({ id: 1 }, { name: "Mona", age: 35 });
  const updatedMona = await users.find({ name: "Mona" });
  console.log("After updateOne({ id: 1 }, { name: 'Mona', age: 35 }) =>", updatedMona);
  assert(updatedMona[0].age === 35);
  console.log("Updated Alice to Mona and changed age");

  // 1updateMany()
  await users.updateMany({ tags: "blogger" }, { "meta.active": false });
  const allBloggers = await users.find({ tags: "blogger" });
  console.log("Bloggers after updateMany =>", allBloggers);
  for (const u of allBloggers) assert(u.meta.active === false);
  console.log("All bloggers marked inactive");

  // 1findOne() test
  const single = await users.findOne({ age: 30 });
  console.log("findOne({ age: 30 }) =>", single);
  assert(single.name === "Charlie" || single.name === "Mona");
  console.log("findOne returned a single matching document");

  // 1find() with sort, limit, skip
  const sorted = await users.find({}, { sort: { age: -1 }, limit: 2, skip: 0 });
  console.log("Sorted descending by age, limit 2 =>", sorted);
  assert(sorted.length === 2); // ensure we have at least 2
  assert(sorted[0].age >= sorted[1].age);
  console.log("Sorting and pagination working");

  // 1deleteOne()
  await users.deleteOne({ name: "Mona" });
  const afterDeleteOne = await users.find({});
  console.log("After deleteOne({ name: 'Mona' }) =>", afterDeleteOne);
  assert(afterDeleteOne.length === 2);
  console.log("Deleted one user (Mona)");

  // 1deleteMany()
  await users.deleteMany({ "meta.city": "Delhi" });
  const remaining = await users.find({});
  console.log("Remaining users after deleteMany =>", remaining);
  assert(remaining.length === 1);
  assert(remaining[0].name === "Bob");
  console.log("Deleted all users from Delhi");

  //--------------------------------------------------------------------------------------
  // Query operators Test
  console.log("Operator Tests");

  await users.deleteMany({});
  await users.insertMany([
    { id: 10, name: "Eve", age: 28, tags: ["dev"], meta: { city: "Pune", active: true } },
    { id: 11, name: "Raj", age: 35, tags: ["manager", "engineer"], meta: { city: "Chennai", active: false } },
    { id: 12, name: "Anita", age: 40, tags: ["dev", "blogger"], meta: { city: "Bangalore", active: true } },
  ]);

  const gt30 = await users.find({ age: { $gt: 30 } });
  assert(gt30.length === 2 && gt30.every(u => u.age > 30));
  console.log("$gt operator works");

  const lte35 = await users.find({ age: { $lte: 35 } });
  assert(lte35.length === 2 && lte35.every(u => u.age <= 35));
  console.log("$lte operator works");

  const ageEq28 = await users.find({ age: { $eq: 28 } });
  assert(ageEq28.length === 1 && ageEq28[0].name === "Eve");

  const notRaj = await users.find({ name: { $ne: "Raj" } });
  assert(notRaj.length === 2 && notRaj.every(u => u.name !== "Raj"));
  console.log("$eq and $ne operators work");

  const inCity = await users.find({ "meta.city": { $in: ["Pune", "Chennai"] } });
  assert(inCity.length === 2);

  const ninTest = await users.find({ "meta.city": { $nin: ["Bangalore"] } });
  assert(ninTest.length === 2 && ninTest.every(u => u.meta.city !== "Bangalore"));
  console.log("$in and $nin operators work");

  const hasCity = await users.find({ "meta.city": { $exists: true } });
  assert(hasCity.length === 3);

  const noField = await users.find({ "meta.country": { $exists: false } });
  assert(noField.length === 3);
  console.log("$exists operator works");

  const orTest = await users.find({
    $or: [{ age: { $lt: 30 } }, { "meta.city": "Bangalore" }]
  });
  assert(orTest.length === 2);
  console.log("$or operator works")

  const andTest = await users.find({
    $and: [{ age: { $gt: 30 } }, { "meta.city": "Bangalore" }]
  })
  assert(andTest.length === 1 && andTest[0].name === "Anita");
  console.log("$and operator works");

  // Final check
  console.log(" All tests passed!");
})();
