export type SchemaDefinition = {
    [key: string]:
    | StringConstructor
    | NumberConstructor
    | BooleanConstructor
    | SchemaDefinition
