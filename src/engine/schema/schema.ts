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
