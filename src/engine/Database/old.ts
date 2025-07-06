import fsp from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import Schema from "../schema/schema";
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

    private dataBasePath = "JsonDBLite";
    private data: T[] = [];
    private index: Map<string, Map<string, Set<number>>> = new Map();

    private fieldIndexes: Record<string, Map<string, number | number[]>> = {};

    constructor(
        private name: string,
        private schema: Schema,
        private indexFields: (keyof T)[]
    ) {
        this.dataBasePath = path.join(this.dataBasePath, name);
        // const fileManager = new FileManager(name, schema);
    }
    // Returns Database path
    private get dataFile() {
        return path.join(this.dataBasePath, `${this.name}.db.bson`);
    }
    // Returns index file path
    private get indexFile() {
        return path.join(this.dataBasePath, `${this.name}.idx.bson`);
    }
    // Load Database and index file data on memory
    async load(): Promise<void> {
        // Database File does not exist
        // Create file with empty array
        await fsp.mkdir(this.dataBasePath, { recursive: true });
        await fsp.writeFile(this.dataFile, "");

        // Create all field index if not exists
        for (const key in this.schema.definition) {
            const indexPath = path.join(this.dataBasePath, `${key}.idx.bson`);
            if (!fs.existsSync(indexPath)) {
                console.log(indexPath);
                await fsp.writeFile(indexPath, "");
            }
        }

    }

    // Save this.data on Database
    private async save(): Promise<void> {
        await fsp.mkdir(this.dataBasePath, { recursive: true });
        await fsp.writeFile(this.dataFile, JSON.stringify(this.data, null, 2));
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
        await fsp.writeFile(this.indexFile, JSON.stringify(json, null, 2));
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
