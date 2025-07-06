import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import Schema from "../schema/schema";
import RwLock from "@sufalctl/rwlock";

export class FileManager {
    private dbPath = "JsonDBLite";
    private dbName: string;
    private fileLocks: Map<string, RwLock<void>> = new Map();

    constructor(name: string, private schema: Schema) {
        this.dbName = name;
        this.dbPath = path.join(this.dbPath, name);
        mkdirSync(this.dbPath, { recursive: true });

        // Main DB file
        this.ensureFile(`${name}.db.bson`);

        // Index files
        for (const key in schema.definition) {
            this.ensureFile(`${key}.idx.bson`);
        }
    }

    private ensureFile(fileName: string): void {
        const fullPath = path.join(this.dbPath, fileName);
        if (!existsSync(fullPath)) {
            writeFileSync(fullPath, "");
        }
        if (!this.fileLocks.has(fileName)) {
            this.fileLocks.set(fileName, new RwLock<void>(undefined));
        }
    }

    private getLock(fileName: string): RwLock<void> {
        const lock = this.fileLocks.get(fileName);
        if (!lock) {
            throw new Error(`Missing lock for file: ${fileName}`);
        }
        return lock;
    }

    async cleanLoad(): Promise<void> {
        await this.removeGarbage(`${this.dbName}.db.bson`);
        for (const key in this.schema.definition) {
            await this.removeGarbage(`${key}.idx.bson`);
        }
    }

    async removeGarbage(fileName: string): Promise<void> {
        const fullPath = path.join(this.dbPath, fileName);
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

    async append(field: string, data: Buffer): Promise<void> {
        const fileName = field.endsWith(".bson") ? field : `${field}.idx.bson`;
        const fullPath = path.join(this.dbPath, fileName);
        const lock = this.getLock(fileName);

        const [_, release] = await lock.write();
        try {
            await fsp.appendFile(fullPath, data);
        } finally {
            release();
        }
    }

    async read(field: string): Promise<Buffer> {
        const fileName = field.endsWith(".bson") ? field : `${field}.idx.bson`;
        const fullPath = path.join(this.dbPath, fileName);
        const lock = this.getLock(fileName);

        const [_, release] = await lock.read();
        try {
            return await fsp.readFile(fullPath);
        } finally {
            release();
        }
    }
}
