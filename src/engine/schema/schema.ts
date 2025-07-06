export type SchemaDefinition = {
    [key: string]: StringConstructor | NumberConstructor | BooleanConstructor | Schema;
}

class Schema {
    constructor(public definition: SchemaDefinition) { }

    validate(doc: any): boolean {
        // Checks doc all fields are vaild
        // Also check no extra fields have
        for (const key in doc) {
            if (!(key in this.definition)) {
                throw new Error(`Missing field: ${key}`);
            }
        }
        // Checks defined all fields are vaild
        // And all DataType are vaild
        for (const key in this.definition) {
            if (!(key in doc)) {
                throw new Error(`Missing field: ${key}`);
            }
            const expect = this.definition[key];
            const value = doc[key];

            if (expect instanceof Schema) {
                if (typeof value !== "object" || value === null || Array.isArray(value)) {
                    throw new Error(`Field "${key}" must be a nested object`);
                }
                expect.validate(value);
            } else {
                const actualType = typeof value;
                const expectType = this.getTypeName(expect);
                if (actualType !== expectType) {
                    throw new Error(`Field "${key}", must be ${expectType}, got ${actualType}`)
                }
            }
        }
        return true;
    }

    private getTypeName(type: Function): String {
        switch (type) {
            case String: return "string";
            case Number: return "number";
            case Boolean: return "boolean";
            default: throw new Error(`Unsupported type in schema: ${type}`);
        }
    }
}

export default Schema;