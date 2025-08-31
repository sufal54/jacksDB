export type IndexEntry = {
    offset?: number;
    [key: string]: any;
};

export type IndexOut = {
    offset: number;
    length: number;
    capacity: number;
} & Record<string, number[]>;

