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
