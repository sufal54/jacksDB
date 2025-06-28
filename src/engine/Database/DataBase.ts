import fs from "node:fs/promises";
import path from "node:path";
import Schema from "../schemaValid/schemaValid";
import { FileManager } from "../fileManagement/fileManager";

export type Primitive = string | number | boolean;

// Field logical opreators
export type QueryOperator =
    | { $eq: Primitive }
    | { $ne: Primitive }
    | { $gt: number }
    | { $gte: number }
    | { $lt: number }
    | { $lte: number }
    | { $in: Primitive[] }
    | { $nin: Primitive[] };

// Query can be a field match or a logical query
export type Query =
    | Record<string, Primitive | QueryOperator>
    | { $or: Query[] }
    | { $and: Query[] };

export class Database<T extends Record<string, any>> {
    private DatabaseName = "JsonDBLite";
    private data: T[] = [];
    private index: Map<string, Map<string, Set<number>>> = new Map();

    constructor(
        private name: string,
        private schema: Schema,
        private indexFields: (keyof T)[]
    ) {
        this.DatabaseName = path.join(this.DatabaseName, name);
        const fileManager = new FileManager(name, schema);
    }
    // Returns Database path
    private get dataFile() {
        return path.join(this.DatabaseName, `${this.name}.db.bson`);
    }
    // Returns index file path
    private get indexFile() {
        return path.join(this.DatabaseName, `${this.name}.idx.bson`);
    }
    // Load Database and index file data on memory
    async load(): Promise<void> {
        try {
            // Load Database data
            const raw = await fs.readFile(this.dataFile, "utf8");
            this.data = JSON.parse(raw);
        } catch {
            this.data = [];
            // Database File does not exist
            // Create file with empty array
            await fs.mkdir(this.DatabaseName, { recursive: true });
            await fs.writeFile(this.dataFile, "");
        }

        try {
            // Load indexs
            const rawIdx = await fs.readFile(this.indexFile, "utf8");
            // Parse json to object
            const parsed: Record<string, Record<string, number[]>> = JSON.parse(rawIdx);
            // Clear previous index data
            this.index.clear();
            // Iterate all index fields
            for (const field in parsed) {
                // Create map that store value which is key here and it's index
                const map = new Map<any, Set<number>>();

                for (const key in parsed[field]) {
                    map.set(key, new Set(parsed[field][key]));
                }
                this.index.set(field, map);
            }
        } catch {
            // load all fields from Database and its index
            this.rebuildIndex();
            await this.saveIndex();
            // Index File does not exist
            // Save empty index file
            await fs.mkdir(this.DatabaseName, { recursive: true });
            await fs.writeFile(this.indexFile, "");
        }
    }

    // Save this.data on Database
    private async save(): Promise<void> {
        await fs.mkdir(this.DatabaseName, { recursive: true });
        await fs.writeFile(this.dataFile, JSON.stringify(this.data, null, 2));
    }
    // Get index and save it this.index
    private async saveIndex(): Promise<void> {
        const json: Record<string, Record<any, number[]>> = {};
        for (const [field, fieldMap] of this.index.entries()) {
            json[field] = {};
            for (const [key, ids] of fieldMap.entries()) {
                json[field][key] = Array.from(ids);
            }
        }
        // overwrite
        await fs.writeFile(this.indexFile, JSON.stringify(json, null, 2));
    }

    // Iterate all field in data and build indexes
    private rebuildIndex(): void {
        this.index.clear();
        for (let i = 0; i < this.data.length; i++) {
            const doc = this.data[i];
            for (const field of this.indexFields) {
                const val = this.getValue(doc, field as string);
                const map = this.index.get(field as string) ?? new Map();
                if (!map.has(val)) map.set(val, new Set());
                map.get(val)!.add(i);
                this.index.set(field as string, map);
            }
        }
    }

    private getValue(doc: any, fieldPath: string): any {
        // split "." then check each key in object and gets nested value from object
        return fieldPath.split(".").reduce((acc, key) => acc?.[key], doc);
    }

    private match(value: any, condition: any): boolean {
        if (typeof condition !== "object" || condition === null || Array.isArray(condition)) {
            return value === condition;
        }

        for (const op in condition) {
            const expected = condition[op];
            switch (op) {
                case "$eq":
                    if (value !== expected) return false;
                    break;
                case "$ne":
                    if (value === expected) return false;
                    break;
                case "$gt":
                    if (value <= expected) return false;
                    break;
                case "$gte":
                    if (value < expected) return false;
                    break;
                case "$lt":
                    if (value >= expected) return false;
                    break;
                case "$lte":
                    if (value > expected) return false;
                    break;
                case "$in":
                    if (!expected.includes(value)) return false;
                    break;
                case "$nin":
                    if (expected.includes(value)) return false;
                    break;
                default:
                    throw new Error(`Unsupported operator: ${op}`);
            }
        }

        return true;
    }

    private matchesQuery(doc: T, query: Query): boolean {
        if (typeof query === "object" && !Array.isArray(query) && query !== null) {
            if ("$or" in query && Array.isArray(query.$or)) {
                return query.$or.some(sub => this.matchesQuery(doc, sub));
            }
            if ("$and" in query && Array.isArray(query.$and)) {
                return query.$and.every(sub => this.matchesQuery(doc, sub));
            }
        }

        return Object.entries(query as Record<string, any>).every(([key, cond]) =>
            this.match(this.getValue(doc, key), cond)
        );
    }

    async insert(doc: T): Promise<void> {
        // Validate schema
        this.schema.validate(doc);
        // The length of data from database
        const idx = this.data.length;
        // Push the data on thsi.data
        this.data.push(doc);

        for (const field of this.indexFields) {
            // Get value or nested value
            const val = this.getValue(doc, field as string);
            // If the field already exist or create new
            const map = this.index.get(field as string) ?? new Map();
            // Inside field value which is act as a key not exist
            if (!map.has(val)) {
                map.set(val, new Set())
            };
            // Insert new index data
            map.get(val)!.add(idx);
            this.index.set(field as string, map);
        }
        // Save all
        await this.save();
        await this.saveIndex();
    }

    find(
        query: Query,
        options?: {
            projection?: Partial<Record<keyof T, 0 | 1>>; // Partial when we want to make inside everything optinal
            sort?: Partial<Record<keyof T, 1 | -1>>;
            limit?: number;
            skip?: number;
        }
    ): Partial<T>[] {
        let results: Partial<T>[] = this.data.filter(doc =>
            this.matchesQuery(doc, query)
        );

        if (options?.sort) {
            for (const [key, dir] of Object.entries(options.sort).reverse()) {
                results.sort((a, b) => {
                    const va = this.getValue(a, key);
                    const vb = this.getValue(b, key);
                    return dir === 1
                        ? va > vb
                            ? 1
                            : va < vb
                                ? -1
                                : 0
                        : vb > va
                            ? 1
                            : vb < va
                                ? -1
                                : 0;
                });
            }
        }

        if (options?.skip) {
            results = results.slice(options.skip);
        }

        if (options?.limit) {
            results = results.slice(0, options.limit);
        }

        if (options?.projection) {
            results = results.map(doc => {
                const projected: Partial<T> = {};
                for (const key in options.projection) {
                    if (options.projection[key] === 1) {
                        projected[key] = this.getValue(doc, key);
                    }
                }
                return projected;
            });
        }

        return results;
    }

    all(): T[] {
        return [...this.data];
    }
}
