declare class Crypto {
    private readonly algorithm;
    private readonly key;
    constructor(secretKey?: string);
    /**
     * parse jason data to encrypted buffer
     * including 0xfd 4byte length 4byte of capcity 16byte of iv and rest of data + 50byte of extra length
     * @param text - json string
     * @returns - encrypted buffer
     */
    encrypt(text: string): Buffer;
    /**
     * takes encrypted buffer and decrypte it and return the value
     * @param encodeDoc - encrypted buffer
     * @returns - json string
     */
    decrypt(encodeDoc: Buffer): string;
    /**
     * if new data is less then or equal of old data capacity
     * then change old data with new data and return new updated buffer or return null
     * @param oldDoc - old doc in buffer
     * @param newDoc - new doc in buffer
     * @returns buffer
     */
    isWithinCapacity(oldDoc: Buffer, newDoc: Buffer): Buffer | null;
}
export default Crypto;
