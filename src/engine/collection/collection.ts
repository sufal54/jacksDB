import { FileManager } from "../fileManagement/fileManager";
import Schema from "../schema/schema";

export class Collection {
    private fileManager: FileManager;
    private schema: Schema;

    constructor(collectionName: string, schema: Schema, secret?: string) {
        this.schema = schema;
        this.fileManager = new FileManager(collectionName, secret);
    }

    private matches(doc: any, query: Record<string, any>): boolean {
        for (const [key, value] of Object.entries(query)) {
            const fieldVal = key.split('.').reduce((acc, part) => acc?.[part], doc);

            if (Array.isArray(fieldVal)) {
                if (!fieldVal.includes(value)) return false;
            } else if (fieldVal !== value) {
                return false;
            }
        }
        return true;
    }


    private deepMerge(target: any, source: any): any {
        for (const key in source) {
            const srcVal = source[key];
            const tgtVal = target[key];

            if (
                srcVal &&
                typeof srcVal === 'object' &&
                !Array.isArray(srcVal)
            ) {
                target[key] = this.deepMerge(
                    tgtVal && typeof tgtVal === 'object' && !Array.isArray(tgtVal) ? tgtVal : {},
                    srcVal
                );
            } else {
                target[key] = srcVal;
            }
        }
        return target;
    }


    private dotPathToObject(dotObj: Record<string, any>): any {
        const result: any = {};
        for (const [key, value] of Object.entries(dotObj)) {
            const parts = key.split(".");
            let curr = result;
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                if (i === parts.length - 1) {
                    curr[part] = value;
                } else {
                    if (!curr[part]) {
                        curr[part] = {};
                    }
                    curr = curr[part];
                }
            }
        }
        return result;
    }


    async insertOne(doc: any): Promise<void> {
        const validated = this.schema.validate(doc);
        if (!validated) {
            return;
        }
        await this.fileManager.dataBaseInsert("main.db.bson", doc);
    }

    async insertMany(docs: any[]): Promise<void> {
        const validated = docs.map(d => this.schema.validate(d));
        if (!validated) {
            return;
        }
        await this.fileManager.dataBaseInsert("main.db.bson", ...docs);
    }

    private deepGet(obj: any, path: string): any {
        return path.split(".").reduce((acc, key) => acc?.[key], obj);
    }

    async find(query: Record<string, any> = {}, options: { sort?: Record<string, 1 | -1>, skip?: number, limit?: number } = {}): Promise<any[]> {
        const { sort = {}, skip = 0, limit = 20 } = options;

        const keys = Object.keys(query);
        let matchedOffsets = new Set<number>();

        let usedIndex = false;
        for (const key of keys) {
            const val = query[key];
            const indexData = await this.fileManager.indexFind(`${key}.idx.bson`, val.toString());
            if (indexData && indexData[val.toString()]) {
                for (const offset of indexData[val.toString()]) {
                    matchedOffsets.add(offset);
                }
                usedIndex = true;
                break;
            }
        }

        const results: any[] = [];
        if (usedIndex) {
            for (const offset of matchedOffsets) {
                try {
                    const data = await this.fileManager.dataBaseFind(offset);
                    if (this.matches(data, query)) {
                        results.push(data);
                    }
                } catch (err: any) {
                    if (err.message !== "Invalid tag: not a valid block") throw err;
                }
            }
        } else {
            for await (const doc of await this.fileManager.fullScan()) {
                if (this.matches(doc, query)) {
                    results.push(doc);
                }
            }
        }

        // Sort
        if (Object.keys(sort).length > 0) {
            results.sort((a, b) => {
                for (const key in sort) {
                    const dir = sort[key];
                    const aVal = this.deepGet(a, key);
                    const bVal = this.deepGet(b, key);

                    if (aVal < bVal) return -1 * dir;
                    if (aVal > bVal) return 1 * dir;
                }
                return 0;
            });
        }

        // Apply skip and limit
        return results.slice(skip, skip + limit);
    }



    async updateOne(filter: Record<string, any>, update: Partial<any>): Promise<void> {
        const found = await this.find(filter);
        if (found.length === 0) return;

        const target = found[0];
        const updateParsed = this.dotPathToObject(update);

        const deepCloned = structuredClone(target);


        const newDoc = this.deepMerge(deepCloned, updateParsed);
        // delete newDoc.offset;
        await this.fileManager.dataBaseUpdate(target.offset, newDoc);


    }

    async updateMany(filter: Record<string, any>, update: Partial<any>): Promise<void> {
        const found = await this.find(filter);
        const updateParsed = this.dotPathToObject(update);

        for (const doc of found) {
            if (doc.offset == null) {
                console.warn("Skipping null offset");
                continue;
            }

            const deepCloned = structuredClone(doc);
            delete deepCloned.offset;

            // Clone updateParsed to avoid shared mutation across docs
            const mergedDoc = this.deepMerge(deepCloned, structuredClone(updateParsed));

            await this.fileManager.dataBaseUpdate(doc.offset, mergedDoc);

        }
    }


    async deleteOne(query: Record<string, any>): Promise<void> {
        const keys = Object.keys(query);
        const matchedOffsets = new Set<number>();

        for (const key of keys) {
            const val = query[key];
            const indexData = await this.fileManager.indexFind(`${key}.idx.bson`, val.toString());
            if (!indexData) continue;
            for (const offset of indexData[val.toString()]) {
                matchedOffsets.add(offset);
            }
        }

        for (const offset of matchedOffsets) {
            try {
                const doc = await this.fileManager.dataBaseFind(offset);
                if (this.matches(doc, query)) {
                    await this.fileManager.dataBaseDelete(offset);
                    return;
                }
            } catch (err: any) {
                if (err.message !== "Invalid tag: not a valid block") throw err;
            }
        }
    }



    async deleteMany(query: Record<string, any>): Promise<void> {
        if (Object.keys(query).length === 0) {
            await this.fileManager.deleteAllFiles();
            return;
        }
        const keys = Object.keys(query);
        const matchedOffsets = new Set<number>();

        for (const key of keys) {
            const val = query[key];
            const indexData = await this.fileManager.indexFind(`${key}.idx.bson`, val.toString());
            if (!indexData) continue;
            for (const offset of indexData[val.toString()]) {
                matchedOffsets.add(offset);
            }
        }

        for (const offset of matchedOffsets) {
            try {
                const doc = await this.fileManager.dataBaseFind(offset);
                if (this.matches(doc, query)) {
                    await this.fileManager.dataBaseDelete(offset);
                }
            } catch (err: any) {
                if (err.message !== "Invalid tag: not a valid block") throw err;
            }
        }
    }

}
