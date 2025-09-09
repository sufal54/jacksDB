import * as crypto from 'node:crypto';
import * as os from 'node:os';

class Crypto {
    private readonly algorithm = "aes-256-cbc"; // AES algorithm
    private readonly key: Buffer;


    constructor(secretKey?: string) {
        // Generate a default key using OS hostname and platform if not provided
        const finalKey = secretKey || `${os.hostname()}-${os.platform()}`;

        this.key = crypto.createHash("sha256").update(finalKey).digest();
    }

    /**
     * parse jason data to encrypted buffer 
     * including 0xfd 4byte length 4byte of capcity 16byte of iv and rest of data + 50byte of extra length
     * @param text - json string
     * @returns - encrypted buffer
     */
    encrypt(text: string): Buffer {
        // Remove all whitespace tap exclude from string
        text = text.replace(/("[^"]*")|(\s+)/g, (match, quoted, space) => {
            return quoted ? quoted : "";
        });
        // 16 byte Iv
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

        let encodeDoc = cipher.update(text, 'utf8', 'hex');
        encodeDoc += cipher.final('hex');
        const buffer = Buffer.from(encodeDoc, "hex");
        const header = Buffer.alloc(9);
        header.writeUint8(0xFD, 0); // 0xFD stand for valid data
        header.writeUint32LE(buffer.length, 1); // length of data
        header.writeUint32LE(buffer.length + 50, 5); // capacity extra 50 bytes

        const extraBytes = Buffer.alloc(50);

        const newBuffer = Buffer.concat([header, iv, buffer, extraBytes]);

        return newBuffer;
    }

    /**
     * takes encrypted buffer and decrypte it and return the value
     * @param encodeDoc - encrypted buffer
     * @returns - json string
     */
    decrypt(encodeDoc: Buffer): string {
        if (encodeDoc[0] !== 0xFD) { // Invaild data case
            throw new Error("Invaild encodeDoc Data");
        }
        const len = encodeDoc.readUint32LE(1);

        const iv = encodeDoc.slice(9, 25);
        const encodeDocText = encodeDoc.slice(25, 25 + len).toString("hex");

        const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
        let decodeDoc = decipher.update(encodeDocText, 'hex', 'utf8');
        decodeDoc += decipher.final();
        return decodeDoc;
    }
    /**
     * if new data is less then or equal of old data capacity 
     * then change old data with new data and return new updated buffer or return null
     * @param oldDoc - old doc in buffer
     * @param newDoc - new doc in buffer
     * @returns buffer
     */
    isWithinCapacity(oldDoc: Buffer, newDoc: Buffer): Buffer | null {
        const oldCapacity = oldDoc.readUint32LE(5);
        const newDataLen = newDoc.readUInt32LE(1);

        if (oldCapacity < newDataLen) {
            return null;
        }

        // Update header with new data length
