import { Collection } from "../engine/collection/collection";
import Schema from "../engine/schema/schema";

export class JacksDB {
    private collections: Map<string, Collection> = new Map();
    private secret?: string;
