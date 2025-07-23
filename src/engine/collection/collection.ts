import { FileManager } from "../fileManagement/fileManager";
import Schema from "../schema/schema";

export class Collection {
    private fileManager: FileManager;
    private schema: Schema;

    constructor(collectionName: string, schema: Schema, secret?: string) {
        this.schema = schema;
        this.fileManager = new FileManager(collectionName, secret);
    }

    /**
     * it's match is the query value is have in our documet
     * @param doc - document
     * @param query - query
     * @returns - if query condition is in our doc so return true else false
     */

    private matches(doc: any, query: Record<string, any>): boolean {

        // Handle $or
        if ("$or" in query) {
            const orConditions = query["$or"];
            if (!Array.isArray(orConditions)) {
                return false;
            }
            return orConditions.some((cond) => this.matches(doc, cond));
        }

        // Handle $and
        if ("$and" in query) {
            const andConditions = query["$and"];
            if (!Array.isArray(andConditions)) {
                return false;
            }
            return andConditions.every((cond) => this.matches(doc, cond)); // Match all element saticfied
        }


        for (const [key, value] of Object.entries(query)) {
            // for nested object address.ip and so one
            const fieldVal = this.deepGet(doc, key);

            if (value && typeof value === "object" && !Array.isArray(value) && !this.isPlainValue(value)) {
                for (const [op, val] of Object.entries(value)) {
                    switch (op) {
                        case "$eq":
                            if (fieldVal !== val) {
                                return false;
                            }
                            break;
                        case "$ne":
                            if (fieldVal === val) {
                                return false;
                            }
                            break;
                        case "$gt":
                            if (typeof fieldVal !== "number" || typeof val !== "number" || !(fieldVal > val)) {
                                return false;
                            }
                            break;
                        case "$gte":
                            if (typeof fieldVal !== "number" || typeof val !== "number" || !(fieldVal >= val)) {
                                return false;
                            }
                            break;
                        case "$lt":
                            if (typeof fieldVal !== "number" || typeof val !== "number" || !(fieldVal < val)) {
                                return false;
                            }
                            break;
                        case "$lte":
                            if (typeof fieldVal !== "number" || typeof val !== "number" || !(fieldVal <= val)) {
                                return false;
                            }
                            break;
                        case "$in":
                            if (!Array.isArray(val) || !val.includes(fieldVal)) {
                                return false;
                            }
                            break;
                        case "$nin":
                            if (Array.isArray(val) && val.includes(fieldVal)) {
                                return false;
                            }
                            break;
                        case "$exists":
                            if (typeof val !== "boolean") {
                                return false;
                            }
                            const exists = fieldVal !== undefined;
                            if (val !== exists) {
                                return false;
                            }
                            break;
                        default:
                            console.warn(`Unsupported operator: ${op}`);
                            return false;
                    }
                }
            } else {
                if (Array.isArray(fieldVal)) {
                    // return false if value is not have in array
                    if (!fieldVal.includes(value)) {
                        return false;
                    }
                } else if (fieldVal !== value) { //case primitive type and not equal to the value return false
                    return false;
                }
            }
        }
        return true;
    }

    private isPlainValue(val: any): boolean {
        const operators = ["$eq", "$ne", "$gt", "$gte", "$lt", "$lte", "$in", "$nin", "$exists", "$regex"];
        if (val === null || typeof val !== "object") {
            return true;
        }
        return Object.keys(val).some(k => !operators.includes(k));
    }


    private deepGet(obj: any, path: string): any {
        return path.split(".").reduce((acc, key) => acc?.[key], obj);
    }

    /**
     * it tooks two object and marge it source to target
     * support nester objec
     * @param target - tagert object i want to overwrite
     * @param source - source all key and value
     * @returns 
     */

    private deepMerge(target: any, source: any): any {
        for (const key in source) {
            const srcVal = source[key];
            const tgtVal = target[key];
            // srcvalue not null and its a object and not array case 
            if (
                srcVal &&
                typeof srcVal === 'object' &&
                !Array.isArray(srcVal)
            ) {
                // we pass if target not null and target is object and its not a array 
                // so pass object for marge else empty object as sourse for overwrite
                // and srcvalue as target for marge
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

    /**
     * converts an object with dot-path keys into a fully nested object.
     * 
     * Example:
     * Input:
     * {
     *   "user.name": "Alice",
     *   "user.age": 25,
     *   "meta.city": "Delhi"
     * }
     * 
     * Output:
     * {
     *   user: {
     *     name: "Alice",
     *     age: 25
     *   },
     *   meta: {
     *     city: "Delhi"
     *   }
     * }
     */

    private dotPathToObject(dotObj: Record<string, any>): any {
        const result: any = {};
        for (const [key, value] of Object.entries(dotObj)) {
            const parts = key.split(".");
            let curr = result;
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                // case last part then add it
                if (i === parts.length - 1) {
                    curr[part] = value;
                } else {
                    // case we have not this object in our object create empty object
                    if (!curr[part]) {
                        curr[part] = {};
                    }
                    curr = curr[part];
                }
            }
        }
        return result;
    }

    /**
     * time - O(1)
     * insert document in database
     * @param doc - document for insert
     * @returns 
     */
    async insertOne(doc: any): Promise<void> {
        // validate all field is valid field and types
        const validated = this.schema.validate(doc);
        // if fasle donot insert return
        if (!validated) {
            console.error("Document does not macth with schema!");
            return;
        }
        await this.fileManager.dataBaseInsert("main.db.bson", doc);
    }

    /**
     * time - O(1*f) = f for number of documet we are inserting
     * insert many document at ones
     * @param docs[] - array of document
     * @returns 
     */

    async insertMany(docs: any[]): Promise<void> {
        const validated = docs.map(d => this.schema.validate(d));
        if (!validated) {
            console.error("Document does not macth with schema!");
            return;
        }
        await this.fileManager.dataBaseInsert("main.db.bson", ...docs);
    }

    /** 
     * time - O(v*l+m) where v = number of query, l = number of list length, m = unique match index/offset 
     * find targeted object from DB
     * @param query - query for search
     * @param options - option like sort skip limit, default empty obj
     * @returns - array of object data
     */
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
    /**
     * We are using find whit limit 1 for now will optimazing later 
     * @param query 
     * @returns - returns single doc
     */
    async findOne(query: Record<string, any> = {}): Promise<any | null> {
        const results = await this.find(query, { limit: 1 });
        return results.length > 0 ? results[0] : null;
    }
