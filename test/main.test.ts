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
  for (const d of data) {
    await fm.appendInFile("main.db.bson", d);
  }

})()



