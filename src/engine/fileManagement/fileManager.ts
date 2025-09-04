import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import RwLock from "@sufalctl/rwlock";
import Crypto from "../../crypto/crypto";
import { IndexEntry, IndexOut, FindOptions } from "./types";

export class FileManager {
    private dataBasePath = "JacksDB";
    private mainDB: string = "main.db.bson";
    private fileLocks: Map<string, RwLock<void>> = new Map();
    private crypto: Crypto;


    private _index: Map<string, Map<string, Set<number>>> = new Map(); // test no use
    private _fieldIndexes: Record<string, Map<string, number | number[]>> = {}; // test no use

    /**
    Initialize FileManager of a collection
    * @param {string} name - name of collection
    * @param {String} secret - option a secret key for better encryption
    * @return {this} 
  */
    constructor(
        name: string,
        secret?: string
    ) {
        this.dataBasePath = path.join(this.dataBasePath, name); // Path of collection in database
        this.crypto = new Crypto(secret);

        // Make path if does not exist
        fs.mkdirSync(this.dataBasePath, { recursive: true });

        // Main DB file
        this.ensureFile(`main.db.bson`);

    }
    /**
     * Ensure file and lock file exists if not it will create in sync mananer
     * @param {string} fileName - name of file path with extension
     */
    private ensureFile(fileName: string): void {
        const fullPath = path.join(this.dataBasePath, fileName);

        try {
            if (!fs.existsSync(fullPath)) {
                fs.writeFileSync(fullPath, "");
            }
            if (!this.fileLocks.has(fileName)) {
                this.fileLocks.set(fileName, new RwLock<void>(undefined));
            }
        } catch (err) {
            console.log(err);
            throw new Error(`Error Occurs when try to ensure file ${fileName}`)
        }
    }


    /**
     * Get the file lock for safe read and write
     * @param {string} fileName - name of file path with extension
     * @returns {RwLock} - Return specfice index RwLock
     */
    private getLock(fileName: string): RwLock<void> {
        if (!this.fileLocks.has(fileName)) {
            this.ensureFile(fileName);
        }

        const lock = this.fileLocks.get(fileName);
        if (!lock) {
            throw new Error(`Missing lock for file: ${fileName}`);
        }
        return lock;
    }
    /**
     * scan entire database O(n) time
     * @returns {any[]} - array of json data
     */
    async fullScan(): Promise<any[]> {
        const results: any[] = [];
        const [_, rel] = await this.getLock(this.mainDB).read();
        const fullPath = path.join(this.dataBasePath, this.mainDB);

        return new Promise((resolve, reject) => {
            const readStream = fs.createReadStream(fullPath);
            let leftover = Buffer.alloc(0);

            readStream.on("data", (chunk) => {
                const buffer = Buffer.concat([leftover, Buffer.from(chunk)]);
                let offset = 0;

                while (offset < buffer.length) {
                    const remaining = buffer.length - offset;

                    if (remaining < 25) { // Not enough for even the header
                        break;
                    }

                    const currByte = buffer[offset];
                    const length = buffer.readUInt32LE(offset + 1);
                    const capacity = buffer.readUInt32LE(offset + 5);
                    const totalSize = 1 + 4 + 4 + 16 + capacity;

                    // Incomplete block
                    if (offset + totalSize > buffer.length) {
                        break;
                    }

                    const block = buffer.slice(offset, offset + totalSize);

                    if (currByte === 0xFD) {
                        try {
                            const decrypted = this.crypto.decrypt(block);
                            const json = JSON.parse(decrypted);
                            results.push(json);
                        } catch (err) {
                            console.warn(`Error decrypting block at ${offset}:`, err);
                        }
                    }

                    // Skip both deleted (0xDE) and valid (0xFD) blocks
                    offset += totalSize;
                }

                leftover = buffer.slice(offset); // Store leftover for next chunk
            });

            readStream.on("end", () => {
                readStream.destroy();
                rel();
                resolve(results);
            });

            readStream.on("error", (err) => {
                readStream.destroy();
                rel();
                reject(err);
            });
        });
    }


    /**
     * Time O(1)
     * It's takes offset and return single Doc
     * Error if worng offset or Mark as deleted
     * @param offset - Database offset
     * @returns 
     */
    async dataBaseFind(offset: number) {
        const [_, rel] = await this.getLock(this.mainDB).read();
        const fullPath = path.join(this.dataBasePath, this.mainDB);
        const file = await fsp.open(fullPath, 'r');

        try {
            // Read the header first: 1 + 4 + 4 + 16 = 25 bytes
            const headerBuffer = Buffer.alloc(25);
            await file.read(headerBuffer, 0, 25, offset);

            // Invalidate tag
            if (headerBuffer[0] !== 0xFD) {
                // console.warn("Invalid Header: not a valid block")
                return;
            }

            // const length = headerBuffer.readUInt32LE(1);
            const capacity = headerBuffer.readUInt32LE(5);

            // Total block size
            const totalSize = 1 + 4 + 4 + 16 + capacity;

            // Read the full block
            const fullBuffer = Buffer.alloc(totalSize);
            await file.read(fullBuffer, 0, totalSize, offset);
            const jsonData = this.crypto.decrypt(fullBuffer);

            return JSON.parse(jsonData);
        } finally {
            await file.close().catch((e) => console.error(e));
            rel();
        }
    }

    /**
     * Time O(1)
     * It's takes Database offset and MArk it as deleted
     * @param offset - Database offset
     * @returns 
     */
    async dataBaseDelete(offset: number): Promise<void> {
        const [_, rel] = await this.getLock(this.mainDB).write();
        const fullPath = path.join(this.dataBasePath, this.mainDB);
        const file = await fsp.open(fullPath, "r+");

        let jsonData: IndexEntry | null = null;

        try {
            const header = Buffer.alloc(25);
            await file.read(header, 0, 25, offset);

            if (header[0] !== 0xFD) {
                // await file.close();
                // rel();
                console.warn("Block already deleted or invalid");
                return;
            }

            const capacity = header.readUInt32LE(5);
            const totalSize = 25 + capacity;
            const fullBuf = Buffer.alloc(totalSize);
            await file.read(fullBuf, 0, totalSize, offset);

            const decrypted = this.crypto.decrypt(fullBuf);
            jsonData = JSON.parse(decrypted) as IndexEntry;

            // Mark as deleted
            const markBuf = Buffer.alloc(1);
            markBuf.writeUInt8(0xDE);
            await file.write(markBuf, 0, 1, offset);
            await file.sync(); // Flush instant
        } finally {
            await file.close();
            rel();
        }

        if (jsonData) {
            try {
                await this.cleanupIndexesFromDoc(jsonData);
            } catch (err) {
                console.error("Failed to clean up index:", err);
            }
        }
    }
    /**
     * For deleteMany({})
     * It's delete all the files have in our collection
     * @returns 
     */
    async deleteAllFiles(): Promise<void> {
        const dir = this.dataBasePath;
        // All files inside of Dir
        const files = await fsp.readdir(dir);
        if (files.length === 0) {
            return;
        }
        for (const file of files) {
            const fileLock = this.fileLocks.get(file);
            // If file lock have then lock the file and delete for safety else just delete the file
            if (fileLock) {
                const [_, rel] = await fileLock.write();
                await fsp.unlink(path.join(dir, file));
                rel();
            } else {
                await fsp.unlink(path.join(dir, file));
            }

        }
    }

    /**
     * update database if new doc length is greater then its capacity then delete old doce append new also update indxes
     * @param offset - offset of database
     * @param newDoc - the doc we are going to insert
     * @returns 
     */

    async dataBaseUpdate(offset: number, newDoc: Partial<IndexEntry>) {
        const [_, rel] = await this.getLock(this.mainDB).read();
        const fullPath = path.join(this.dataBasePath, this.mainDB);
        const readFile = await fsp.open(fullPath, "r+");

        try {
            const header = Buffer.alloc(25); // For headers
            await readFile.read(header, 0, 25, offset);
            // Invalid Block return
            if (header[0] !== 0xFD) {
                await readFile.close();
                rel();
                throw new Error("Invalid block or already deleted");
            }

            const oldCapacity = header.readUInt32LE(5); // Read Capacity 
            const totalSize = 1 + 4 + 4 + 16 + oldCapacity; // TotalSize

            const oldBlockBuf = Buffer.alloc(totalSize); // Buffer for store the oldDoc
            await readFile.read(oldBlockBuf, 0, totalSize, offset); // Get the Raw Data
            const oldJson = JSON.parse(this.crypto.decrypt(oldBlockBuf)) as IndexEntry; // Parse into Object

            let encoded = this.crypto.encrypt(JSON.stringify({ ...newDoc, offset })); // NewDoc to Raw from
            const newLength = encoded.readUInt32LE(1);
            await readFile.sync();
            await readFile.close();
            rel();

            await this.cleanupIndexesFromDoc(oldJson); // Clean old doc offset from index file
            // Case when new Doc length is greater then old data's capacity
            if (newLength > oldCapacity) {
                await this.makeAsDeleteAddNew(this.mainDB, offset, newDoc); // Mark old Doc as deleted and append new Doc
                return;
            }

            // Store all Index file and its Offsets
            const indexFields = new Map<string, Map<string, number[]>>(); // strucher Map<filedName,Map<value,[indexs]>>
            for (const [key, val] of Object.entries(newDoc)) {
                // If filed is offset then skip
                if (key === "offset") {
                    continue;
                }
                // Add all indexs inside indesFiels
                this.indexAllFields(indexFields, val, offset, oldCapacity, key);
            }
            // Writes all indexs in index file
            await this.writeIndexMap(indexFields);

            // Copy Old doc capacity
            const capacityBuf = Buffer.alloc(4);
            capacityBuf.writeUInt32LE(oldCapacity);
            // Overwrite oldcapacity in new Raw Doc
            capacityBuf.copy(encoded, 5);

            // Cut extra buffer we adds +50 byte for future update
            // Some case it will Overlap with next Doc
            encoded = encoded.slice(0, 1 + 4 + 4 + 16 + newLength);

            const [_, writeRel] = await this.getLock(this.mainDB).write();
            const writeFile = await fsp.open(fullPath, "r+");
            // Overwrite new Doc on old location
            await writeFile.write(encoded, 0, encoded.length, offset);
            await writeFile.sync(); // Flush data into disk
            await writeFile.close();
            writeRel();
        } catch (err) {
            console.log(err);
        }
    }

    /**
     * Delete indexs from index file
     * @param doc 
     */
    private async cleanupIndexesFromDoc(doc: IndexEntry): Promise<void> {
        for (const [key, val] of Object.entries(doc)) {
            // If offset field skip it
            if (key === "offset") {
                continue;
            }
            await this.deleteFieldFromIndexes(key, val, doc.offset!);
        }
    }

    /**
     * 
     * @param key 
     * @param value 
     * @param offset 
     * @param pathPrefix - Object case for join prevous filed
     */
    private async deleteFieldFromIndexes(key: string, value: any, offset: number, pathPrefix: string = ""): Promise<void> {
        const fullPath = [pathPrefix, key].filter(Boolean).join(".");
        // Handle nested values usin g recurstion
        // Case value array
        if (Array.isArray(value)) {
            for (const item of value) {
                await this.deleteFieldFromIndexes("", item, offset, fullPath);
            }
            // Case value Object
        } else if (typeof value === "object" && value !== null) {
            for (const [k, v] of Object.entries(value)) {
                await this.deleteFieldFromIndexes(k, v, offset, fullPath);
            }
            // Primitive Data
        } else if (["string", "number", "boolean"].includes(typeof value)) {
            const valStr = value.toString();
            const indexFile = `${fullPath}.idx.bson`;
            await this.deleteFileIdxOffset(indexFile, valStr, offset);
        }
    }




    /**
    * Append document to the Database
    * Also Update/Create indexes to the specfice index file
    * 
    * @param {string} fileName - Name of the file to write with extenstion.
    * @return {Promise<void>}  
    * @param {IndexEntry} doc - Object data we are going to insert
     */


    async dataBaseInsert(fileName: string, ...docs: Partial<IndexEntry>[]): Promise<void> {

        const flatDocs: Partial<IndexEntry>[] = docs.flat(); // Remove nestet array

        const [_, rel] = await this.getLock(fileName).write();
        const fullPath = path.join(this.dataBasePath, fileName);
        const write = await fsp.open(fullPath, "a");

        // Size of file is the offset of new Doc
        let offset = (await write.stat()).size;

        let encodeBufferDoc: Buffer[] = [];

        const indexFields = new Map<string, Map<string, number[]>>();

        try {
            for (const doc of flatDocs) {
                if (!doc) {
                    continue;
                }

                const currOffset = offset;

                doc.offset = currOffset;
                const encodeDoc = this.crypto.encrypt(JSON.stringify(doc));
                encodeBufferDoc.push(encodeDoc);
                const capacity = encodeDoc.readUInt32LE(5);
                offset += 1 + 4 + 4 + 16 + capacity;

                // Send all key value for nested value 
                for (const [key, value] of Object.entries(doc)) {
                    if (key === "offset") {
                        continue;
                    }
                    this.indexAllFields(indexFields, value, currOffset, capacity, key);
                }
            }

            await write.write(Buffer.concat(encodeBufferDoc));
            await write.sync();
        } catch (err) {
            console.error("appendInFile error:", err);
            await write.close();
            rel();
            return;
        }

        await write.close();
        rel();

        await this.writeIndexMap(indexFields);
    }

    /**
     * For nested object or array recursive iteration each element
     * For better index file name
     * Arrange way store all Offsets inside map
     * @param {any} value - The value store in our data base field
     * @param {number} offset - Database offset of the data
     * @param {string} basePath - name of our index file 
     */

    private indexAllFields(map: Map<string, Map<string, number[]>>, value: any, offset: number, capacity: number, basePath: string): void {
        // Array Case
        if (Array.isArray(value)) {
            for (const item of value) {
                this.indexAllFields(map, item, offset, capacity, basePath); // Keep path as field name for array 
            }
            // Object case
        } else if (typeof value === "object" && value !== null) {
            for (const [key, val] of Object.entries(value)) {
                const fullPath = `${basePath}.${key}`;
                this.indexAllFields(map, val, offset, capacity, fullPath);
            }

            // For Primitive data
        } else if (["string", "number", "boolean"].includes(typeof value)) {
            const valStr = value.toString();
            if (!map.has(basePath)) {
                map.set(basePath, new Map());
            }
            const pathMap = map.get(basePath)!;
            if (!pathMap.has(valStr)) {
                pathMap.set(valStr, []);
            }
            pathMap.get(valStr)!.push(offset);
        }
    }

    /**
     * Write Doc fields value on index file
     * @param indexMap - Map of <field,Map<value,[offsets]>>
     */
    private async writeIndexMap(indexMap: Map<string, Map<string, number[]>>): Promise<void> {

        for (const [key, valMap] of indexMap.entries()) {
            const file = `${key}.idx.bson`; // Key to file name
            this.ensureFile(file); // Make file if it first time

            for (const [valStr, offsets] of valMap.entries()) {
                const existing = await this.indexFind(file, valStr); // Find is the value already exists
                // Case exists then add another offset else append
                if (existing) {
                    await this.addFileIdxOffset(file, valStr, existing, ...offsets); // handles merge
                } else {
                    const doc: Partial<IndexEntry> = {
                        [valStr]: offsets,
                        offset: undefined // will be added by appendIndexEntry
                    };
                    await this.appendIndexEntry(file, doc);
                }
            }
        }
    }

    /**
    For Index files
    Reads a binary file and extracts valid index blocks (tagged with 0xFD).
    Skips deleted blocks (tagged with 0xDE).
    
    * @param {string} fileName - Name of the file to read.
    * @return {Promise<IndexEntry | null>} - A fields indexs or null if not found
  */

    async indexFind(fileName: string, value: string): Promise<IndexOut | null> {
        return new Promise(async (resolve, reject) => {

            const [_, rel] = await this.getLock(fileName).read();
            const readStream = fs.createReadStream(path.join(this.dataBasePath, fileName));
            let leftover = Buffer.alloc(0); // Store half or incomplete previous chunk data

            let isBroke = false; // check is leftover store data or clean

            readStream.on("data", (chunk) => {

                // Marge prevouse data and curren chunk data
                const buffer = Buffer.concat([leftover, Buffer.from(chunk)]);
                let i = 0;

                while (i < buffer.length) {
                    // Check current index
                    const tag = buffer[i];

                    if (tag === 0xFD || tag === 0xDE) {
                        if (i + 9 > buffer.length) {// Incomplete block header
                            isBroke = true;
                            break;
                        }

                        const capacity = buffer.readUInt32LE(i + 5); // Datas capacity
                        const totalSize = 1 + 4 + 4 + 16 + capacity; // Entire Data

                        if (i + totalSize > buffer.length) {// Incomplete block body
                            isBroke = true;
                            break;
                        }
                        // If it Mark as Vaild Data
                        if (tag === 0xFD) {
                            const bufferData = buffer.slice(i, i + totalSize); // Slice block of data
                            const decryptData = this.crypto.decrypt(bufferData); // Encrypt the data
                            const jsonData = JSON.parse(decryptData) as IndexOut; // Json Parse
                            if (Object.keys(jsonData)[0] == value) { // Check is current data is targeted data
                                jsonData.length = bufferData.readInt32LE(1); // Inside object add data length
                                jsonData.capacity = bufferData.readInt32LE(5); // Inside object add data capacity


                                readStream.destroy() // Close readStream
                                rel(); // Release lock
                                return resolve(jsonData); // Resolve and return
                            }
                        }

                        i += totalSize; // Skip either block type
                    } else {
                        // Not part of a block, just skip or optionally handle
                        i++;
                    }
                }

                if (isBroke) {
                    leftover = buffer.slice(i); // Save only the unprocessed part
                } else {
                    leftover = Buffer.alloc(0); // Clean it — nothing to carry over
                }
            });
            // End of readStream
            readStream.on("end", () => {

                readStream.destroy();
                rel();
                resolve(null);
            });
            // On Error
            readStream.on("error", (err) => {
                readStream.destroy();
                rel();
                console.error(err);
                reject(null);

            });
        })
    }




    /**
   * Adds an index entry for a specific key and value pointing to a data offset.
   * If the value already exists in the index, the offset is added to its list.
   * If not, a new index entry is created and stored.
   * 
   * @param {string} key - The field name to index (e.g. "name", "age").
   * @param {string | number | boolean} val - The actual value to index.
   * @param {number} offset - The byte offset of the corresponding record in the data file.
   */
    private async indexField(key: string, val: string | number | boolean, offset: number) {
        const file = `${key}.idx.bson`;
        // Ensure fiel exist or create new
        this.ensureFile(file);
        const valStr = val.toString();

        const exists = await this.indexFind(file, valStr);
        if (exists) {
            // Append anothe offset
            await this.addFileIdxOffset(file, valStr, offset);
        } else {
            // Create new index object
            const idxDoc = { [valStr]: [offset], offset };
            await this.appendIndexEntry(file, idxDoc);
        }
    }

    /**
     * Appends a new index entry to the end of an index file.
     * The entry is encrypted and written with its offset information.
     * 
     * @param {string} fileName - Name of the index file to write to.
     * @param {Partial<IndexEntry>} doc - The document to store (value-to-offset mapping).
     */
    private async appendIndexEntry(fileName: string, doc: Partial<IndexEntry>): Promise<void> {
        const [_, rel] = await this.getLock(fileName).write();
        const fullPath = path.join(this.dataBasePath, fileName);
        const write = await fsp.open(fullPath, "a");
        try {
            doc.offset = (await write.stat()).size;
            const encodeDoc = this.crypto.encrypt(JSON.stringify(doc));
            await write.write(encodeDoc);
            await write.sync();
        } catch (err) {
            console.error("appendIndexEntry error:", err);
        } finally {
            await write.close();
            rel();
        }
    }


    /**
        * Delete main database field indexs update index file
        * @param fileName - name of file with extenstion
        * @param value - field value which is key of index file
        * @param dataBaseOffset - main database offset which is save on index file
        * @returns - void promise
        */

    private async addFileIdxOffset(fileName: string, value: string, doc: any, ...dataBaseOffset: number[]) {
        const [v, relRead] = await this.getLock(fileName).read();
        const idxData = doc
        const fullPath = path.join(this.dataBasePath, fileName);
        relRead();

        if (!idxData) {
            const newEntry: Partial<IndexEntry> = {
                [value]: dataBaseOffset,
            };
            await this.appendIndexEntry(fileName, newEntry);
            return;
        }

        const [_, rel] = await this.getLock(fileName).write();
        const fileHandle = await fsp.open(fullPath, 'r+');

        try {
            idxData[value].push(...dataBaseOffset);
            const newData: Record<string, any> = {
                [value]: idxData[value],
                offset: idxData.offset,
            };

            const encodeDoc = this.crypto.encrypt(JSON.stringify(newData));

            if (idxData.capacity < encodeDoc.readUInt32LE(1)) {
                await this.makeAsDeleteAddNew(fileName, idxData.offset, newData);
                return;
            }

            const capacityBuffer = Buffer.alloc(4);
            capacityBuffer.writeInt32LE(idxData.capacity);
            capacityBuffer.copy(encodeDoc, 5, 0, 4);

            await fileHandle.write(encodeDoc, 0, encodeDoc.length, idxData.offset);
            await fileHandle.sync();
        } catch (err) {
            console.error(err);
        } finally {
            await fileHandle.close();
            rel();
        }
    }


    /**
   * Delete main database field indexs update index file
   * @param fileName - name of file with extenstion
   * @param value - field value which is key of index file
   * @param dataBaseOffset - main database offset which is save on index file
   * @returns - void promise
   */

    private async deleteFileIdxOffset(fileName: string, value: string, dataBaseOffset: number) {
        const [v, relRead] = await this.getLock(fileName).read();
        const idxData = await this.indexFind(fileName, value);
        const fullPath = path.join(this.dataBasePath, fileName);
        relRead();
        if (!idxData) {
            // console.error(`${value} not found in ${fullPath}`);
            return;
        }

        const [_, rel] = await this.getLock(fileName).write();
        const fileHandle = await fsp.open(fullPath, 'r+');

        const offsetArray = idxData[value];
        const newOffsetArray = offsetArray.filter((item) => item !== dataBaseOffset);

        if (offsetArray.length === newOffsetArray.length) {
            await fileHandle.close();
            rel();
            return;
        }

        if (newOffsetArray.length === 0) {
            // Delete the entire block
            const markBuf = Buffer.alloc(1);
            markBuf.writeUInt8(0xDE);
            await fileHandle.write(markBuf, 0, 1, idxData.offset);
            await fileHandle.sync();
            await fileHandle.close();
            rel();
            return;
        }

        // Update block with remaining offsets
        idxData[value] = newOffsetArray;
        const newData: Record<string, any> = {};
        newData[value] = newOffsetArray;
        newData.offset = idxData.offset;

        try {
            const encodeDoc = this.crypto.encrypt(JSON.stringify(newData));
            const capacityBuffer = Buffer.alloc(4);
            capacityBuffer.writeInt32LE(idxData.capacity);
            capacityBuffer.copy(encodeDoc, 5, 0, 4);
            await fileHandle.write(encodeDoc, 0, encodeDoc.length, idxData.offset);
            await fileHandle.sync();
        } finally {
            await fileHandle.close();
            rel();
        }
    }

    /**
       * Mark as delete data and append new one
       * @param fileName - name of file with extenstion
       * @param offset - field value which is key of index file
       * @param doc - option if data pase then append it
       * @returns - void promise
       */

    async makeAsDeleteAddNew(fileName: string, offset: number, doc?: Partial<IndexEntry>) {
        const [_, rel] = await this.getLock(fileName).write();
        const filePath = path.join(this.dataBasePath, fileName);
        const write = await fsp.open(filePath, "r+");


        const deletBufferMark = Buffer.alloc(1);
        deletBufferMark.writeUInt8(0xDE);
        await write.write(deletBufferMark, 0, 1, offset);
        await write.sync();
        await write.close();
        rel();
        if (doc) {
            await this.dataBaseInsert(fileName, doc);

        }
    }

    // Remove those data are marked as delete or grabage
    /**
        * @param {string} fileName - name of file path with extension
    */
    async removeGarbage(fileName: string): Promise<void> {
        return new Promise(async (resolve, reject) => {

            const realFilePath = path.join(this.dataBasePath, fileName);
            const tempFilePath = path.join(this.dataBasePath, "temp.bson");
            const [_, rel] = await this.getLock(fileName).write();
            const readStream = fs.createReadStream(realFilePath);
            const writeStream = fs.createWriteStream(tempFilePath, { flags: "a" });

            let leftover = Buffer.alloc(0); // Store half or incomplete previous chunk data

