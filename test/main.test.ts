// // import { JsonDBLite } from "./engine/Database/DataBase";
// import { Database } from "../src/engine/Database/old";
// import Schema from "../src/engine/schema/schema"
// import Crypto from "../src/crypto/crypto";
// import { FileManager } from "../src/engine/fileManagement/fileManager";
// (async function main() {

//   const data = {
//     name: String,
//     age: Number
//   }

//   const schem = new Schema(data);
//   const crypto = new Crypto();
//   const fm = new FileManager("hello", schem);



//   // await fm.appendFileIdx("name.idx.bson", crypto.encrypt("hello"));
//   // const buffer = crypto.encrypt("hello");
//   // buffer[0] = 0xDE;
//   // await fm.appendFileIdx("name.idx.bson", buffer);
//   // await fm.appendFileIdx("name.idx.bson", JSON.parse('{"alice":[1,4,3]}'));
//   // await fm.appendFileIdx("name.idx.bson", JSON.parse('{"sufal":[7,2,3]}'));
//   // await fm.appendFileIdx("name.idx.bson", JSON.parse('{"mona":[1,4,8]}'));
//   // await fm.appendFileIdx("name.idx.bson", JSON.parse('{"adam":[9,8,3,5,2]}'));

//   // const obj1 = { adam: [9, 8, 3] };
//   // const buf1 = crypto.encrypt(JSON.stringify(obj1));
//   // console.log("Before Length:", buf1.readInt32LE(1)); // e.g. 32

//   // const obj2 = { adam: [9, 8] };
//   // const buf2 = crypto.encrypt(JSON.stringify(obj2));
//   // console.log("After Length:", buf2.readInt32LE(1));  // e.g. 16


//   // await fm.removeGarbage("name.idx.bson");

//   // console.log("before", await fm.readFileIdx("name.idx.bson", "adam"));
//   // await fm.deleteFileIdxOffset("name.idx.bson", "adam", 9);
//   // console.log("after delete", await fm.readFileIdx("name.idx.bson", "adam"));
//   // await fm.addFileIdxOffset("name.idx.bson", "adam", 1);
//   // console.log("after add", await fm.readFileIdx("name.idx.bson", "adam"));

//   // const db = new Database("hello", schem, []);
//   // await db.load()
//   // const crypt = new Crypto();
//   // console.log(crypt.decrypt(crypt.encrypt("Hello")));
// })()


function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    console.error(`❌ ${message}: expected ${expected}, got ${actual}`);
    process.exitCode = 1;
  } else {
    console.log(`✅ ${message}`);
  }
}

// Example test
function add(a, b) {
  return a + b;
}

assertEqual(add(1, 2), 3, '1 + 2 should equal 3');
assertEqual(add(2, 2), 4, '2 + 2 should equal 4');
assertEqual(add(0, 0), 0, '0 + 0 should equal 0');
