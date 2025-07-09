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
