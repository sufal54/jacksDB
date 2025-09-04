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

