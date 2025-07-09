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
            }

            const actual = doc[key];

            // Handle array types
            if (Array.isArray(expected)) {
                if (!Array.isArray(actual)) {
                    throw new Error(`Field "${key}" must be an array`);
                }

                const itemType = expected[0];
                for (let i = 0; i < actual.length; i++) {
                    const item = actual[i];
                    if (itemType instanceof Schema) {
                        if (!this.isPlainObject(item)) {
                            throw new Error(`Field "${key}[${i}]" must be a nested object`);
                        }
                        itemType.validate(item);
                    } else {
                        const expectedTypeName = this.getTypeName(itemType);
                        const actualItemType = typeof item;
                        if (actualItemType !== expectedTypeName) {
                            throw new Error(`Field "${key}[${i}]" must be ${expectedTypeName}, got ${actualItemType}`);
                        }
                    }
                }

                // Handle nested object
            } else if (expected instanceof Schema) {
                if (!this.isPlainObject(actual)) {
                    throw new Error(`Field "${key}" must be a nested object`);
                }
                expected.validate(actual);

                // Handle primitives
            } else {
                const expectedTypeName = this.getTypeName(expected);
                const actualTypeName = typeof actual;
                if (actualTypeName !== expectedTypeName) {
                    throw new Error(`Field "${key}" must be ${expectedTypeName}, got ${actualTypeName}`);
                }
            }
        }

