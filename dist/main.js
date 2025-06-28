"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const encodeDecode_helper_1 = require("./helper/encodeDecode.helper");
let a = (0, encodeDecode_helper_1.encode)("hello", 7);
(0, encodeDecode_helper_1.decode)(a, 7);
