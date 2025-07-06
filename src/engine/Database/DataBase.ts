import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

interface Document {
    _id: string;
    [key: string]: any;
}

interface IndexEntry {
    _id: string;
    offset: number;
    length: number;
    deleted?: boolean;
}

export class JsonDBLite<T extends Document> {
    private dataPath: string;
    private mainIndexPath: string;
    private fieldIndexes: Record<string, Map<string, Set<string>>> = {};
    private fullTextIndexes: Record<string, Map<string, Set<string>>> = {};

    constructor(private dbDir: string, private indexedFields: (keyof T)[], private fullTextFields: (keyof T)[]) {
        this.dataPath = path.join(dbDir, "data.db");
        this.mainIndexPath = path.join(dbDir, "main.idx.json");

        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }
    }

    async init() {

        await this.loadMainIndex();
        await this.loadFieldIndexes();
        await this.loadFullTextIndexes();


    }

    private async loadMainIndex() {
        if (!fs.existsSync(this.mainIndexPath)) {
            await fsp.writeFile(this.mainIndexPath, "[]");
        }
    }

    private async loadFieldIndexes() {
        for (const field of this.indexedFields) {
            const indexPath = this.getFieldIndexPath(field);
            if (fs.existsSync(indexPath)) {
                const raw = await fsp.readFile(indexPath, "utf8");
                const obj = JSON.parse(raw) as Record<string, string[]>;

                this.fieldIndexes[String(field)] = new Map(Object.entries(obj).map(([k, v]) => [k, new Set(v)]));
            } else {
                this.fieldIndexes[String(field)] = new Map();
            }
        }
    }

    private async loadFullTextIndexes() {
        for (const field of this.fullTextFields) {
            const indexPath = path.join(this.dbDir, `textindex.${String(field)}.json`);

            if (fs.existsSync(indexPath)) {
                const raw = await fsp.readFile(indexPath, "utf8");

                const obj = JSON.parse(raw) as Record<string, string[]>;

                this.fullTextIndexes[String(field)] = new Map(
                    Object.entries(obj).map(([k, v]) => [k, new Set(v)])

                );
            } else {
                this.fullTextIndexes[String(field)] = new Map();
            }
        }
    }

    private async saveFullTextIndex() {
        for (const [field, map] of Object.entries(this.fullTextIndexes)) {
            const json: Record<string, string[]> = {};
            for (const [value, ids] of map.entries()) {
                json[value] = Array.from(ids)
            }

            await fsp.writeFile(path.join(this.dbDir, `textindex.${field}.json`), JSON.stringify(json), "utf8");
        }
    }

    private getFieldIndexPath(field: keyof T) {
        return path.join(this.dbDir, `index.${String(field)}.json`);
    };

    private async saveFieldIndexes() {
        for (const [field, map] of Object.entries(this.fieldIndexes)) {
            const json: Record<string, string[]> = {};

            for (const [value, ids] of map.entries()) {
                json[value] = Array.from(ids)
            }

            await fsp.writeFile(this.getFieldIndexPath(field as keyof T), JSON.stringify(json), "utf8");
        }
    }
    private async getMainIndex(): Promise<IndexEntry[]> {
        const raw = await fsp.readFile(this.mainIndexPath, "utf8");

        if (!raw.trim()) {
            return [];
        }

        return JSON.parse(raw);
    }

    private async saveMainIndex(idex: IndexEntry[]) {
        await fsp.writeFile(this.mainIndexPath, JSON.stringify(idex), "utf8");
    }

    private tokenize(text: string): string[] {
        return text.toLowerCase().replace(/[^a-z0-9]/g, '').split('').filter(Boolean);
    }

    private async addToFieldIndexs(doc: T) {
        for (const field of this.indexedFields) {
            const val = String(doc[field]);
            const map = this.fieldIndexes[String(field)];

            if (!map.has(val)) {
                map.set(val, new Set());
            }

            map.get(val)!.add(doc._id);
        }

        for (const field of this.fullTextFields) {
            const tokens = this.tokenize(String(doc[field]));

            const map = this.fullTextIndexes[String(field)];

            for (const token of tokens) {
                if (!map.has(token)) {
                    map.set(token, new Set());
                }

                map.get(token)!.add(doc._id);
            }
        }
    }

    private async removeFromFieldIndexes(doc: T) {
        for (const field of this.indexedFields) {
            const val = String(doc[field]);
            const map = this.fieldIndexes[String(field)];

            map.get(val)?.delete(doc._id);

            if (map.get(val)?.size === 0) {
                map.delete(val);
            }
        }

        for (const field of this.fullTextFields) {
            const tokens = this.tokenize(String(doc[field]));

            const map = this.fullTextIndexes[String(field)];

            for (const token of tokens) {
                if (!map.has(token)) {
                    map.set(token, new Set());
                }

                map.get(token)!.add(doc._id);
            }
        }
    }

    private generateId(): string {
        return crypto.randomBytes(12).toString();
    }

    private encodeDoc(doc: object): Buffer {
        const str = JSON.stringify(doc);
        const content = Buffer.from(str, "utf8");

        const len = Buffer.alloc(4);
        len.writeUint32BE(content.length, 0);
        return Buffer.concat([len, content]);
    }

    private decodeDoc(buffer: Buffer): any {
        const len = buffer.readUInt32BE(0);

        const str = buffer.slice(4, 4 + len).toString("utf8");

        return JSON.parse(str);
    }

    async insert(doc: Omit<T, "_id"> & Partial<Pick<T, "_id">>): Promise<T> {
        const _id = doc._id || this.generateId();

        const fullDoc = { ...doc, _id } as T;

        const buf = this.encodeDoc(fullDoc);
        console.log(this.dataPath);

        const fh = await fsp.open(this.dataPath, "a+");

        const { size } = await fh.stat();

        await fh.write(buf);
        await fh.close();

        const index = await this.getMainIndex();

        index.push({ _id, offset: size, length: buf.length });
        await this.saveMainIndex(index);

        await this.addToFieldIndexs(fullDoc);

        await this.saveFieldIndexes();
        await this.saveFullTextIndex();

        return fullDoc;
    }
}