import * as crypto from 'node:crypto';
import * as os from 'node:os';

class Crypto {
    private readonly algorithm = "aes-256-cbc"; // AES algorithm
    private readonly key: Buffer;


    constructor(secretKey?: string) {
