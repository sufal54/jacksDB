"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
class RwLock {
    constructor(value) {
        this.readers = 0;
        this.writer = false;
        this.readQueue = [];
        this.writeQueue = [];
        this.value = value;
    }
    reads() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.writer) {
                this.readers++;
                return [this.value, () => this.releaseRead()];
            }
            return new Promise((res) => {
                const tryLock = () => {
                    this.readers++;
                    res([this.value, () => this.releaseRead()]);
                };
                this.readQueue.push(tryLock);
            });
        });
    }
    write() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.writer && this.readers === 0) {
                this.writer = true;
                return [this.value, () => this.releaseWrite()];
            }
            return new Promise((res) => {
                const tryLock = () => {
                    this.writer = true;
                    res([this.value, () => this.releaseWrite()]);
                };
                this.writeQueue.push(tryLock);
            });
        });
    }
    setWrite() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.writer && this.readers === 0) {
                this.writer = true;
                return [this.value, (newValue) => this.setReleaseWrite(newValue)];
            }
            return new Promise((res) => {
                const tryLock = () => {
                    this.writer = true;
                    res([this.value, (newValue) => this.setReleaseWrite(newValue)]);
                };
                this.writeQueue.push(tryLock);
            });
        });
    }
    releaseRead() {
        this.readers--;
        this.next();
    }
    setReleaseWrite(newValue) {
        this.value = newValue;
        this.writer = false;
        this.next();
    }
    releaseWrite() {
        this.writer = false;
        this.next();
    }
    next() {
        if (this.writer && this.readers == 0 && this.writeQueue.length > 0) {
            const nextWriter = this.writeQueue.shift();
            nextWriter();
        }
        else if (!this.writer && this.writeQueue.length == 0) {
            while (this.readQueue.length > 0) {
                const nextReader = this.readQueue.shift();
                nextReader();
            }
        }
    }
}
exports.default = RwLock;
