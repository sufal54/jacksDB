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
