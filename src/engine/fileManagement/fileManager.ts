import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import Schema from "../schema/schema";
import RwLock from "@sufalctl/rwlock";
import Crypto from "../../crypto/crypto";

type IndexEntry = {
    offset?: number;
    capacity?: number;
    [key: string]: any;
};


type IndexOut = {
    offset: number;
    length: number;
    capacity: number;
} & Record<string, number[]>;

export class FileManager {
    private dataBasePath = "JsonDBLite";
    private mainDB: string = "main.db.bson";
    private fileLocks: Map<string, RwLock<void>> = new Map();
    private crypto: Crypto;


    private _index: Map<string, Map<string, Set<number>>> = new Map(); // test no use
    private _fieldIndexes: Record<string, Map<string, number | number[]>> = {}; // test no use

    /**
    Initialize FileManager of a collection
    * @param {string} name - name of collection
    * @param {Schema} schema - the scheam
    * @param {String} secret - option a secret key for better encryption
    * @return {this} 
  */
    constructor(
        name: string,
        private schema: Schema,
        secret?: string
    ) {
        this.dataBasePath = path.join(this.dataBasePath, name);
        this.crypto = new Crypto(secret);

        // Make path if does not exist
        fs.mkdirSync(this.dataBasePath, { recursive: true });

        // Main DB file
        this.ensureFile(`main.db.bson`);

    }
    /**
     * Ensure file exist or it will create it in sync
     * @param {string} fileName - name of file path with extension
     */
    private ensureFile(fileName: string): void {
        console.log(fileName);
        const fullPath = path.join(this.dataBasePath, fileName);
        console.log(fullPath);

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

    async readFromDataBase(offset: number) {
        const [_, rel] = await this.getLock(this.mainDB).read();
        const fullPath = path.join(this.dataBasePath, this.mainDB);
        const file = await fsp.open(fullPath, 'r');

        try {
            // Read the header first: 1 + 4 + 4 + 16 = 25 bytes
            const headerBuffer = Buffer.alloc(25);
            await file.read(headerBuffer, 0, 25, offset);

            // Validate tag
            if (headerBuffer[0] !== 0xFD) {
                throw new Error("Invalid tag: not a valid block");
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
            await file.close();
            rel();
        }
    }

    /**
    For Index files
    Reads a binary file and extracts valid blocks (tagged with 0xFD).
    Skips deleted blocks (tagged with 0xDE).
    
    * @param {string} fileName - Name of the file to read.
    * @return {Promise<IndexEntry | null>} - A fields indexs or null if not found
  */

    async readFileIdx(fileName: string, value: string): Promise<IndexOut | null> {
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

                        const capacity = buffer.readUInt32LE(i + 5); // Data's capacity
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

                                readStream.close() // Close readStream
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
                readStream.close();
                rel();
                resolve(null);
            });
            // On Error
            readStream.on("error", (err) => {
                readStream.close()
                rel();
                console.error(err);
                reject(null);

            });
        })
    }
    /**
     * Append document to the Database
     * Also Update/Create indexes to the specfice index file
     * 
     * @param {string} fileName - Name of the file to write with extenstion.
     * @return {Promise<void>}  
     * @param {IndexEntry} doc - Object data we are going to insert
      */


    async appendInFile(fileName: string, ...docs: Partial<IndexEntry>[]): Promise<void> {

        const flatDocs: Partial<IndexEntry>[] = docs.flat(); // Remove nestet array

        const [_, rel] = await this.getLock(fileName).write();
        const fullPath = path.join(this.dataBasePath, fileName);
        const write = await fsp.open(fullPath, "a");

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
     * 
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

    private async writeIndexMap(indexMap: Map<string, Map<string, number[]>>): Promise<void> {
        // for (const [field, valueMap] of indexMap.entries()) {
        //     const file = `${field}.idx.bson`;
        //     this.ensureFile(file); // create file if not exist

        //     const [_, rel] = await this.getLock(file).write();
        //     const fullPath = path.join(this.dataBasePath, file);
        //     const writeHandle = await fsp.open(fullPath, "a");

        //     try {
        //         let offset = (await writeHandle.stat()).size;
        //         const buffers: Buffer[] = [];

        //         for (const [valStr, offsets] of valueMap.entries()) {
        //             const doc: Partial<IndexEntry> = {
        //                 [valStr]: offsets,
        //                 offset
        //             };
        //             const encoded = this.crypto.encrypt(JSON.stringify(doc));
        //             buffers.push(encoded);
        //             offset += encoded.length;
        //         }

        //         const finalBuffer = Buffer.concat(buffers);
        //         await writeHandle.write(finalBuffer);
        //     } catch (err) {
        //         console.error(`writeIndexMap error (${file}):`, err);
        //     } finally {
        //         await writeHandle.close();
        //         rel();
        //     }
        // }

        for (const [key, valMap] of indexMap.entries()) {
            const file = `${key}.idx.bson`;
            this.ensureFile(file);

            for (const [valStr, offsets] of valMap.entries()) {
                const existing = await this.readFileIdx(file, valStr);
                if (existing) {
                    await this.addFileIdxOffset(file, valStr, ...offsets); // handles merge
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
   * Adds an index entry for a specific key and value pointing to a data offset.
   * If the value already exists in the index, the offset is added to its list.
   * If not, a new index entry is created and stored.
   * 
   * @param {string} key - The field name to index (e.g. "name", "age").
   * @param {string | number | boolean} val - The actual value to index.
   * @param {number} offset - The byte offset of the corresponding record in the data file.
   */
    async indexField(key: string, val: string | number | boolean, offset: number) {
        const file = `${key}.idx.bson`;
        // Ensure fiel exist or create new
        this.ensureFile(file);
        const valStr = val.toString();
        console.log(file);

        const exists = await this.readFileIdx(file, valStr);
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

    async addFileIdxOffset(fileName: string, value: string, ...dataBaseOffset: number[]) {

        const [v, relRead] = await this.getLock(fileName).read();
        const idxData = await this.readFileIdx(fileName, value);
        const fullPath = path.join(this.dataBasePath, fileName);
        relRead();
        if (!idxData) {
            console.error(`${value} not found in ${fullPath}`);
            return;
        }
        const [_, rel] = await this.getLock(fileName).write();

        const fileHandle = await fsp.open(fullPath, 'r+');


        idxData[value].push(...dataBaseOffset);
        const newData: Record<string, any> = {};

        newData[value] = idxData[value];
        newData.offset = idxData.offset;

        try {
            const encodeDoc = this.crypto.encrypt(JSON.stringify(newData));

            if (idxData.capacity < encodeDoc.readUInt32LE(1)) {
                await fileHandle.close();
                rel();
                await this.makeAsDeleteAddNew(fileName, idxData.offset, newData);
                return
            }

            const capacityBuffer = Buffer.alloc(4);
            capacityBuffer.writeInt32LE(idxData.capacity);
            // Old data capacity
            capacityBuffer.copy(encodeDoc, 5, 0, 4);
            await fileHandle.write(encodeDoc, 0, encodeDoc.length, idxData.offset);

            await fileHandle.close();
            rel();
        } catch (err) {
            console.error(err);
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

    async deleteFileIdxOffset(fileName: string, value: string, dataBaseOffset: number) {

        const [v, relRead] = await this.getLock(fileName).read();
        const idxData = await this.readFileIdx(fileName, value);
        const fullPath = path.join(this.dataBasePath, fileName);
        relRead();
        if (!idxData) {
            console.error(`${value} not found in ${fullPath}`);
            return;
        }
        const [_, rel] = await this.getLock(fileName).write();

        const fileHandle = await fsp.open(fullPath, 'r+');

        const offsetArray = idxData[value];

        const newOffsetArray = offsetArray.filter((item) => item !== dataBaseOffset);

        if (offsetArray.length === newOffsetArray.length) {
            rel();
            return;
        }
        idxData[value] = newOffsetArray;
        const newData: Record<string, any> = {};

        newData[value] = idxData[value];
        newData.offset = idxData.offset;
        try {
            const encodeDoc = this.crypto.encrypt(JSON.stringify(newData));
            const capacityBuffer = Buffer.alloc(4);
            capacityBuffer.writeInt32LE(idxData.capacity);
            // Old data capacity
            capacityBuffer.copy(encodeDoc, 5, 0, 4);
            await fileHandle.write(encodeDoc, 0, encodeDoc.length, idxData.offset);
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
        if (doc) {
            doc.offset = (await write.stat()).size;
            await write.close();
            rel();
            await this.appendInFile(fileName, doc);
        } else {
            await write.close();
            rel();
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

            let isBroke = false; // check is leftover store data or clean

            readStream.on("data", (chunk) => {
                const buffer = Buffer.concat([leftover, Buffer.from(chunk)]);
                let i = 0;

                while (i < buffer.length) {
                    const tag = buffer[i];

                    if (tag === 0xFD || tag === 0xDE) {
                        if (i + 5 > buffer.length) {// Incomplete block header
                            isBroke = true;
                            break;
                        }

                        const length = buffer.readUInt32LE(i + 5);
                        const totalSize = 1 + 4 + 4 + 16 + length;

                        if (i + totalSize > buffer.length) {// Incomplete block body
                            isBroke = true;
                            break;
                        }
                        if (tag === 0xFD) {
                            const data = buffer.slice(i, i + totalSize);
                            writeStream.write(data, (err) => {
                                if (err) {
                                    writeStream.end();
                                    rel();
                                    return reject(err);
                                }
                            });
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

            readStream.on("end", async () => {
                writeStream.end();

                try {
                    // Delete main file 
                    await fsp.rm(realFilePath, { force: true });

                    // Rename temp.bson to the file
                    await fsp.rename(tempFilePath, realFilePath);
                } catch (err) {
                    console.error("Failed to replace main file:", err);
                }
                rel();
                resolve();
            });

            readStream.on("error", (err) => {
                writeStream.end();
                rel();
                reject(err);

            });
        });
    }
}
