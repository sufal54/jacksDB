import { JacksDB, Schema } from "../index";
import assert from "node:assert";

(async function testDB() {
  // Setup schema
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

  // Sample data
  const data = [
    {
      id: 1,
      name: "Alice",
      age: 30,
      tags: ["engineer", "blogger"],
      meta: { city: "Delhi", active: true }
    },
    {
      id: 2,
      name: "Bob",
      age: 25,
      tags: ["coder", "blogger"],
      meta: { city: "Mumbai", active: false }
    },
    {
      id: 3,
      name: "Charlie",
      age: 30,
      tags: ["engineer", "designer"],
      meta: { city: "Delhi", active: true }
    }
  ];

  await users.insertMany(data);
  console.log(" Inserted users");

  console.log(" Inserted users");

  const age30 = await users.find({ age: 30 });
  console.log(" Query: { age: 30 } =>", age30);
  console.assert(age30.length === 2);
  console.log(" Found users with age 30");

  const bloggers = await users.find({ tags: "blogger" });
  console.log(" Query: { tags: 'blogger' } =>", bloggers);
  console.assert(bloggers.length === 2);
  console.log(" Found users with tag 'blogger'");

  const delhiUsers = await users.find({ "meta.city": "Delhi" });
  console.log(" Query: { 'meta.city': 'Delhi' } =>", delhiUsers);
  console.assert(delhiUsers.length === 2);
  console.log(" Found users in Delhi");

  //  Update Alice (id: 1) to Mona, age 35
  await users.updateOne({ id: 1 }, { name: "Mona", age: 35 });

  const updatedMona = await users.find({ name: "Mona" });
  console.log(" After updateOne({ id: 1 }, { name: 'Mona', age: 35 }) =>", updatedMona);
  console.assert(updatedMona[0].age === 35);
  console.log(" Updated Alice’s name to Mona and age to 35");

  //  Update many bloggers to inactive
  await users.updateMany({ tags: "blogger" }, { "meta.active": false });

  const allBloggers = await users.find({ tags: "blogger" });
  console.log(" Bloggers after updateMany({ tags: 'blogger' }, { 'meta.active': false }) =>", allBloggers);
  for (const u of allBloggers) {
    console.assert(u.meta.active === false);
  }
  console.log(" Updated all bloggers to inactive");

  // 🗑 Delete Mona
  await users.deleteOne({ name: "Mona" });
  const afterDeleteOne = await users.find({});
  console.log(" After deleteOne({ name: 'Mona' }) =>", afterDeleteOne);
  console.assert(afterDeleteOne.length === 2);
  console.log(" Deleted one user (Mona)");

  // 🗑 Delete all from Delhi
  await users.deleteMany({ "meta.city": "Delhi" });
  const remaining = await users.find({});
  console.log(" Remaining users after deleteMany({ 'meta.city': 'Delhi' }) =>", remaining);
  console.assert(remaining.length === 1);
  console.assert(remaining[0].name === "Bob");
  console.log(" Deleted all users in Delhi");

  console.log(" All tests passed!");

})();
