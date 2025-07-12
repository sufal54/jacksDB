import { Collection } from "../engine/collection/collection";
import Schema from "../engine/schema/schema";

export class JacksDB {
    private collections: Map<string, Collection> = new Map();
    private secret?: string;

    constructor(secret?: string) {
        this.secret = secret;
    }

    collection(name: string, schema: Schema): Collection {
        if (!this.collections.has(name)) {
            const col = new Collection(name, schema, this.secret);
            this.collections.set(name, col);
        }
        return this.collections.get(name)!;
    }
}
