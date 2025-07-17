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
