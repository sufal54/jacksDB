import { Collection } from "../engine/collection/collection";
import Schema from "../engine/schema/schema";
export declare class JacksDB {
    private collections;
    private secret?;
    constructor(secret?: string);
    /**
     *
     * @param name - name of collection
     * @param schema - collection schema
     * @returns -new collection object
     */
    collection(name: string, schema: Schema): Collection;
}
