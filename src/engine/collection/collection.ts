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
