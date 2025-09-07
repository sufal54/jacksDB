export type SchemaDefinition = {
    [key: string]: StringConstructor | NumberConstructor | BooleanConstructor | SchemaDefinition | [StringConstructor | NumberConstructor | BooleanConstructor | SchemaDefinition];
};
declare class Schema {
    definition: Record<string, any>;
    constructor(definition: SchemaDefinition);
    private isPlainObject;
    validate(doc: any): boolean;
    private getTypeName;
}
export default Schema;
