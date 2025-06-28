type UnlockFn = () => void;
type DoneFn = () => void;
declare class RwLock<T> {
    private readers;
    private writer;
    private readQueue;
    private writeQueue;
    private value;
    constructor(value: T);
    reads(): Promise<[T, UnlockFn]>;
    write(): Promise<[T, DoneFn]>;
    setWrite(): Promise<[T, (newValue: T) => void]>;
    private releaseRead;
    private setReleaseWrite;
    private releaseWrite;
    private next;
}
export default RwLock;
