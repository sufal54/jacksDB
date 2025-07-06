// import { JsonDBLite } from "./engine/Database/DataBase";
import { Database } from "../src/engine/Database/old";
import Schema from "../src/engine/schema/schema"
import Crypto from "../src/crypto/crypto";
(async function main() {

  // const data = {
  //   name: String,
  //   age: Number
  // }

  // const schem = new Schema(data);

  // const db = new Database("hello", schem, []);
  // await db.load()
  const crypt = new Crypto();
  console.log(crypt.decrypt(crypt.encrypt("Hello")));
})()