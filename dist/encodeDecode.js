"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encode = void 0;
const encode = (input, key) => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(input);
    const encrypted = bytes.map((byte) => {
        console.log(byte);
        return byte;
    });
};
exports.encode = encode;
