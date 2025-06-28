import RwLock from "@sufalctl/rwlock";
import { FileHandle, open } from "node:fs/promises";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "path";
import Schema from "../schemaValid/schemaValid";
import path from "node:path";

export class FileManager {
    private dbPath = "JsonDBLite";
    private dbName: string;

    private indexLocks: Map<string, RwLock<FileHandle>> = new Map();


    constructor(name: string, schema: Schema) {
        this.dbName = name
        this.dbPath = path.join(this.dbPath, name);
        const filePath = path.join(this.dbPath, `${name}.db.bson`);
        mkdirSync(this.dbPath, { recursive: true });
        if (!existsSync(filePath)) {

            writeFileSync(filePath, "");
        }
        for (const key in schema.definition) {
            const filePath = path.join(`${this.dbPath}`, `${key}.idx.bson`);
            if (!existsSync(filePath)) {
                writeFileSync(filePath, "");
            }
        }
    }

    private getFilePath(field: string): string {
        return join(this.dbPath, `${field}.idx.bson`);
    }

    private async getLock(field: string): Promise<RwLock<FileHandle>> {
        if (!this.indexLocks.has(field)) {
            const fileHandler = await open(`${field}.idx.bson`)
            this.indexLocks.set(field, new RwLock(fileHandler));
        }
        return this.indexLocks.get(field)!;
    }


}
