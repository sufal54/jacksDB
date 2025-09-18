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


