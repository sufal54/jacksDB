export type SchemaDefinition = {
    [key: string]:
    | StringConstructor
    | NumberConstructor
    | BooleanConstructor
    | Schema
    | [StringConstructor | NumberConstructor | BooleanConstructor | Schema];
};


class Schema {
    constructor(public definition: SchemaDefinition) { }

    validate(doc: any): boolean {
        // Check no extra fields
        for (const key in doc) {
            if (!(key in this.definition)) {
                throw new Error(`Unexpected field: ${key}`);
            }
        }

        // Validate all required fields
        for (const key in this.definition) {
            if (!(key in doc)) {
                throw new Error(`Missing field: ${key}`);
            }

            const expect = this.definition[key];
            const value = doc[key];

            // Array support
            if (Array.isArray(expect)) {
                if (!Array.isArray(value)) {
                    throw new Error(`Field "${key}" must be an array`);
                }

                const itemType = expect[0];

                for (let i = 0; i < value.length; i++) {
                    const item = value[i];

                    if (itemType instanceof Schema) {
                        if (typeof item !== "object" || item === null || Array.isArray(item)) {
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
                continue;
            }

            // Nested object
            if (expect instanceof Schema) {
                if (typeof value !== "object" || value === null || Array.isArray(value)) {
                    throw new Error(`Field "${key}" must be a nested object`);
                }
                expect.validate(value);
            } else {
                // Primitive type
                const expectedTypeName = this.getTypeName(expect);
                const actualType = typeof value;
                if (actualType !== expectedTypeName) {
                    throw new Error(`Field "${key}" must be ${expectedTypeName}, got ${actualType}`);
                }
            }
        }

        return true;
    }

    private getTypeName(type: Function): string {
        switch (type) {
            case String: return "string";
            case Number: return "number";
            case Boolean: return "boolean";
            default:
                throw new Error(`Unsupported type in schema: ${type}`);
        }
    }
}

export default Schema;