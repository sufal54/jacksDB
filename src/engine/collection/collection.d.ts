import Schema from "../schema/schema";
export declare class Collection {
    private fileManager;
    private schema;
    constructor(collectionName: string, schema: Schema, secret?: string);
    /**
     * it's match is the query value is have in our documet
     * @param doc - document
     * @param query - query
     * @returns - if query condition is in our doc so return true else false
     */
    private matches;
    private isPlainValue;
    private deepGet;
    /**
     * it tooks two object and marge it source to target
     * support nester objec
     * @param target - tagert object i want to overwrite
     * @param source - source all key and value
     * @returns
     */
    private deepMerge;
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
    private dotPathToObject;
    /**
     * time - O(1)
     * insert document in database
     * @param doc - document for insert
     * @returns
     */
    insertOne(doc: any): Promise<void>;
    /**
     * time - O(1*f) = f for number of documet we are inserting
     * insert many document at ones
     * @param docs[] - array of document
     * @returns
     */
    insertMany(docs: any[]): Promise<void>;
    /**
     * time - O(v*l+m) where v = number of query, l = number of list length, m = unique match index/offset
     * find targeted object from DB
     * @param query - query for search
     * @param options - option like sort skip limit, default empty obj
     * @returns - array of object data
     */
    find(query?: Record<string, any>, options?: {
        sort?: Record<string, 1 | -1>;
        skip?: number;
        limit?: number;
    }): Promise<any[]>;
    /**
     * We are using find whit limit 1 for now will optimazing later
     * @param query
     * @returns - returns single doc
     */
    findOne(query?: Record<string, any>): Promise<any | null>;
    /**
     * Takes query and update it or delete one and create new
     * @param filter
     * @param update
     * @returns
     */
    updateOne(filter: Record<string, any>, update: Partial<any>): Promise<void>;
    updateMany(filter: Record<string, any>, update: Partial<any>): Promise<void>;
    deleteOne(query: Record<string, any>): Promise<void>;
    deleteMany(query: Record<string, any>): Promise<void>;
}
