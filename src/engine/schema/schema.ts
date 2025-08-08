export type SchemaDefinition = {
    [key: string]:
    | StringConstructor
    | NumberConstructor
    | BooleanConstructor
    | SchemaDefinition
    | [StringConstructor | NumberConstructor | BooleanConstructor | SchemaDefinition];
};


class Schema {
    definition: Record<string, any> = {};

    constructor(definition: SchemaDefinition) {
        for (const key in definition) {
            const value = definition[key];

            if (Array.isArray(value)) {
                const item = value[0];
                if (this.isPlainObject(item)) {
                    // Array of nested schemas
                    this.definition[key] = [new Schema(item as SchemaDefinition)];
                } else {
                    // Array of primitives
                    this.definition[key] = value;
                }
            } else if (this.isPlainObject(value)) {
                // Nested object schema
                this.definition[key] = new Schema(value as SchemaDefinition);
            } else {
                // Primitive (StringConstructor, NumberConstructor, etc.)
                this.definition[key] = value;
            }
        }
    }


    private isPlainObject(obj: any) {
        return typeof obj === "object" && obj !== null && !Array.isArray(obj) && !(obj instanceof Schema);
    }

    validate(doc: any): boolean {
        // Check for unexpected fields
        for (const key in doc) {
            if (!(key in this.definition)) {
                throw new Error(`Unexpected field: ${key}`);
            }
        }

        for (const key in this.definition) {
            const expected = this.definition[key];

            if (!(key in doc)) {
                throw new Error(`Missing field: ${key}`);
