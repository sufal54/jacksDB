import * as crypto from 'node:crypto';
import * as os from 'node:os';

class Crypto {
    private readonly algorithm = "aes-256-cbc"; // AES algorithm
    private readonly key: Buffer;


    constructor(secretKey?: string) {
        // Generate a default key using OS hostname and platform if not provided
        const finalKey = secretKey || `${os.hostname()}-${os.platform()}`;

        this.key = crypto.createHash("sha256").update(finalKey).digest();
