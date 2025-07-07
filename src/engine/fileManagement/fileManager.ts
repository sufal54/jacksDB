import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import Schema from "../schema/schema";
import RwLock from "@sufalctl/rwlock";
import Crypto from "../../crypto/crypto";

type IndexEntry = {
    offset: number;
} & Record<string, number[]>;

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
    * @return {this} 
  */
    constructor(
        private name: string,
        private schema: Schema,
        secret?: string
    ) {
        this.dataBasePath = path.join(this.dataBasePath, name);
        this.mainDB = path.join(this.dataBasePath, this.mainDB);
        this.crypto = new Crypto(secret);

        // Make path if does not exist
        fs.mkdirSync(this.dataBasePath, { recursive: true });

        // Main DB file
        this.ensureFile(`main.db.bson`);

        // Index files
        for (const key in schema.definition) {
            this.ensureFile(`${key}.idx.bson`);
        }
    }
    // ensure file exist or it will create it in sync
    /**
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
            throw new Error(`Error Occurs when try to ensure file ${fileName}`)
        }
    }

    // Get the file lock for safe read and write
    /**
     * @param {string} fileName - name of file path with extension
     */
    private getLock(fileName: string): RwLock<void> {
        const lock = this.fileLocks.get(fileName);
        if (!lock) {
            throw new Error(`Missing lock for file: ${fileName}`);
        }
        return lock;
    }

    /**
    For Index files
    Reads a binary file and extracts valid blocks (tagged with 0xFD).
    Skips deleted blocks (tagged with 0xDE).
    
    * @param {string} fileName - Name of the file to read.
    * @return {Promise<IndexEntry[]>}  An array of valid data blocks as buffers.
  */

    async readFileIdx(fileName: string, value: string): Promise<IndexOut | null> {
        return new Promise(async (resolve, reject) => {

            const [_, rel] = await this.getLock(fileName).read();
            const readStream = fs.createReadStream(path.join(this.dataBasePath, fileName));
            let leftover = Buffer.alloc(0); // Store half or incomplete previous chunk data

            let isBroke = false; // check is leftover store data or clean

            readStream.on("data", (chunk) => {
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

                        const length = buffer.readUInt32LE(i + 5);
                        const totalSize = 1 + 4 + 4 + 16 + length;

                        if (i + totalSize > buffer.length) {// Incomplete block body
                            isBroke = true;
                            break;
                        }
                        if (tag === 0xFD) {
                            const bufferData = buffer.slice(i, i + totalSize);
                            const decryptData = this.crypto.decrypt(bufferData);
                            const jsonData = JSON.parse(decryptData) as IndexOut;
                            if (Object.keys(jsonData)[0] == value) {
                                jsonData.length = bufferData.readInt32LE(1); // set length
                                jsonData.capacity = bufferData.readInt32LE(5); // set data
                                resolve(jsonData); // Founded
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

            readStream.on("end", () => {
                rel();
                resolve(null);
            });

            readStream.on("error", (err) => {
                rel();
                reject(err);

            });
        })
    }
    /**
        For Index files
        Write buffer data into the index file
        
        * @param {string} fileName - Name of the file to write with extenstion.
        * @param {Buffer} buffer - encrypted buffer or normal buffer for writing in the file
        * @return {Promise<void>}  
      */
    async appendFileIdx(fileName: string, doc: Partial<IndexEntry>): Promise<void> {
        return new Promise(async (resolve, reject) => {
            const [_, rel] = await this.getLock(fileName).write();
            const fullPath = path.join(this.dataBasePath, fileName);

            const write = await fsp.open(fullPath, "a");
            try {
                const size = (await write.stat()).size;
                doc.offset = size;

                const encodeDoc = this.crypto.encrypt(JSON.stringify(doc));

                await write.write(encodeDoc);
                resolve();
            } catch (err) {
                reject(err);
            } finally {
                await write.close();
                rel();
            }
        });
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
        * Delete main database field indexs update index file
        * @param fileName - name of file with extenstion
        * @param value - field value which is key of index file
        * @param dataBaseOffset - main database offset which is save on index file
        * @returns - void promise
        */

    async addFileIdxOffset(fileName: string, value: string, dataBaseOffset: number) {

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


        idxData[value].push(dataBaseOffset);
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

            // This will hold the valid blocks
            const validBlocks: Buffer[] = [];

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

                        const length = buffer.readUInt32LE(i + 1);
                        const totalSize = 1 + 4 + 16 + length;

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

                                writeStream.end();
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
                rel();
                writeStream.end();
                reject(err);

            });
        });
    }
}
