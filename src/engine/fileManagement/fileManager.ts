import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import Schema from "../schema/schema";
import RwLock from "@sufalctl/rwlock";

interface IndexEntry {
    _id: string;
    offset: number;
    length: number;
    deleted?: boolean;
}
export class FileManager {
    private dataBasePath = "JsonDBLite";
    private mainDB: string = "main.db.bson";
    private index: Map<string, Map<string, Set<number>>> = new Map();

    private fileLocks: Map<string, RwLock<void>> = new Map();

    private fieldIndexes: Record<string, Map<string, number | number[]>> = {};

    constructor(
        private name: string,
        private schema: Schema
    ) {
        this.dataBasePath = path.join(this.dataBasePath, name);
        this.mainDB = path.join(this.dataBasePath, this.mainDB);

        mkdirSync(this.mainDB, { recursive: true });

        // Main DB file
        this.ensureFile(`${name}.db.bson`);

        // Index files
        for (const key in schema.definition) {
            this.ensureFile(`${key}.idx.bson`);
        }
    }
    // ensure file exist or it will create it in sync
    private ensureFile(fileName: string): void {
        const fullPath = path.join(this.dataBasePath, fileName);
        if (!existsSync(fullPath)) {
            writeFileSync(fullPath, "");
        }
        if (!this.fileLocks.has(fileName)) {
            this.fileLocks.set(fileName, new RwLock<void>(undefined));
        }
    }

    // Get the file lock for safe read and write
    private getLock(fileName: string): RwLock<void> {
        const lock = this.fileLocks.get(fileName);
        if (!lock) {
            throw new Error(`Missing lock for file: ${fileName}`);
        }
        return lock;
    }

    /**
   Reads a binary file and extracts valid blocks (tagged with 0xFD).
   Skips deleted blocks (tagged with 0xDE).
  
   @param {string} fileName - Name of the file to read.
   @return {Promise<Buffer[]>} An array of valid data blocks as buffers.
  */

    private async readFileIdx(fileName: string): Promise<Buffer[]> {
        return new Promise(async (resolve, reject) => {

            const [_, rel] = await this.getLock(fileName).read();
            const readStream = fs.createReadStream(path.join(this.dataBasePath, fileName));
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
                            const data = buffer.slice(i + 5, i + totalSize);
                            validBlocks.push(data); // Store the valid data
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
                resolve(validBlocks);
            });

            readStream.on("error", (err) => {
                reject(err);
                rel();

            });
        })
    }


    async removeGarbage(fileName: string): Promise<void> {
        const fullPath = path.join(this.dataBasePath, fileName);
        const tempPath = fullPath + ".tmp";
        const lock = this.getLock(fileName);

        const [_, release] = await lock.write();
        try {
            await new Promise<void>((resolve, reject) => {
                const readStream = fs.createReadStream(fullPath);
                const writeStream = fs.createWriteStream(tempPath);

                readStream.on("error", reject);
                writeStream.on("error", reject);

                readStream.on("data", (chunk) => {
                    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                    const output = Buffer.allocUnsafe(buffer.length);
                    let writeIndex = 0;
                    let lastWasNull = false;

                    for (const byte of buffer) {
                        if (byte === 0x00) {
                            if (!lastWasNull) {
                                output[writeIndex++] = byte;
                                lastWasNull = true;
                            }
                        } else {
                            output[writeIndex++] = byte;
                            lastWasNull = false;
                        }
                    }

                    if (writeIndex > 0) {
                        writeStream.write(output.slice(0, writeIndex));
                    }
                });

                readStream.on("end", () => {
                    writeStream.end();
                });

                writeStream.on("finish", resolve);
            });

            await fsp.rename(tempPath, fullPath);
        } finally {
            release();
        }
    }
}
