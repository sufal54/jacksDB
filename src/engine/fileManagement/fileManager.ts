import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import RwLock from "@sufalctl/rwlock";
import Crypto from "../../crypto/crypto";
import { IndexEntry, IndexOut, FindOptions } from "./types";

export class FileManager {
    private dataBasePath = "JacksDB";
    private mainDB: string = "main.db.bson";
    private fileLocks: Map<string, RwLock<void>> = new Map();
    private crypto: Crypto;


    private _index: Map<string, Map<string, Set<number>>> = new Map(); // test no use
    private _fieldIndexes: Record<string, Map<string, number | number[]>> = {}; // test no use

    /**
    Initialize FileManager of a collection
    * @param {string} name - name of collection
    * @param {String} secret - option a secret key for better encryption
    * @return {this} 
  */
    constructor(
