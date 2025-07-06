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

    encrypt(text: string): Buffer {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const buffer = Buffer.from(encrypted);
        const recuve = Buffer.alloc(5);
        recuve.writeUint8(0xFD, 0);
        recuve.writeUint32LE(buffer.length, 1);

        const newBuffer = Buffer.concat([recuve, iv, buffer]);

        return newBuffer;
    }

    decrypt(encrypted: Buffer): string {
        if (encrypted[0] !== 0xFD) {
            throw new Error("Invaild Encrypted Data");
        }
        const len = encrypted.readUint32LE(1);

        const iv = encrypted.slice(5, 21);
        const encryptedText = encrypted.slice(21, 21 + len).toString("utf8");

        const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
}
export default Crypto;