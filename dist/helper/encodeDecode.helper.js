"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decode = exports.encode = void 0;
const encode = (input, key) => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(input);
    const encrypted = bytes.map((byte) => byte ^ key);
    return encrypted;
};
exports.encode = encode;
const decode = (encryptedBytes, key) => {
    const decoder = new TextDecoder();
    const decrypted = encryptedBytes.map((byte) => byte ^ key);
    const dec = decoder.decode(decrypted);
    return dec;
};
exports.decode = decode;
