export type IndexEntry = {
    offset?: number;
    [key: string]: any;
};

export type IndexOut = {
    offset: number;
    length: number;
    capacity: number;
} & Record<string, number[]>;

export type FindOptions = {
    sort?: Record<string, 1 | -1>;
    skip?: number;
    limit?: number;
}