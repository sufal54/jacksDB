// import { JsonDBLite } from "./engine/Database/DataBase";
import { Database } from "../src/engine/Database/old";
import Schema from "../src/engine/schema/schema"
import Crypto from "../src/crypto/crypto";
import { FileManager } from "../src/engine/fileManagement/fileManager";
import { data } from "./data.test";
(async function main() {



  const schem = new Schema({
    id: Number,
    name: String,
    age: Number,
    tag: [String] as [StringConstructor],
    meta: new Schema({
      citiy: String,
      active: Boolean
    }),
  });
  const crypto = new Crypto();
  const fm = new FileManager("hello", schem);

  // await fm.appendInFile("main.db.bson", data);
  const rd = await fm.readFileIdx("age.idx.bson", "35");
  if (!rd?.offset) {
    return
  }
  console.log(rd);
  console.log(await fm.readFromDataBase(rd["35"][0]));
})()



