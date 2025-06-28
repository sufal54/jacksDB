import { Database } from "./engine/Database/DataBase";
import Schema from "./engine/schemaValid/schemaValid";
const main = async () => {
  const userSchema = new Schema({
    name: String,
    age: Number
  })
  const db = new Database("users", userSchema, ["name", "age"]);
  // await db.load();
  // await db.insert({ name: "Alice", age: 25 });
  // await db.insert({ name: "Bob", age: 30 });
  // await db.insert({ name: "Charlie", age: 18 });

  // const result = db.find({
  //   $or: [
  //     { name: { $eq: "Bob" } },
  //     { age: { $lt: 20 } }
  //   ]
  // });
  // console.log(result);
}

main();