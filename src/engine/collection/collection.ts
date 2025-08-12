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

