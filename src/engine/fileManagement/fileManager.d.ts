import { IndexEntry, IndexOut } from "./types";
export declare class FileManager {
    private dataBasePath;
    private mainDB;
    private fileLocks;
    private crypto;
    private _index;
    private _fieldIndexes;
    /**
    Initialize FileManager of a collection
    * @param {string} name - name of collection
    * @param {String} secret - option a secret key for better encryption
    * @return {this}
  */
    constructor(name: string, secret?: string);
    /**
     * Ensure file and lock file exists if not it will create in sync mananer
     * @param {string} fileName - name of file path with extension
     */
    private ensureFile;
    /**
     * Get the file lock for safe read and write
     * @param {string} fileName - name of file path with extension
     * @returns {RwLock} - Return specfice index RwLock
     */
    private getLock;
    /**
     * scan entire database O(n) time
     * @returns {any[]} - array of json data
     */
    fullScan(): Promise<any[]>;
    /**
     * Time O(1)
     * It's takes offset and return single Doc
     * Error if worng offset or Mark as deleted
     * @param offset - Database offset
     * @returns
     */
    dataBaseFind(offset: number): Promise<any>;
    /**
     * Time O(1)
     * It's takes Database offset and MArk it as deleted
     * @param offset - Database offset
     * @returns
     */
    dataBaseDelete(offset: number): Promise<void>;
    /**
     * For deleteMany({})
     * It's delete all the files have in our collection
     * @returns
     */
    deleteAllFiles(): Promise<void>;
    /**
     * update database if new doc length is greater then its capacity then delete old doce append new also update indxes
     * @param offset - offset of database
     * @param newDoc - the doc we are going to insert
     * @returns
     */
    dataBaseUpdate(offset: number, newDoc: Partial<IndexEntry>): Promise<void>;
    /**
     * Delete indexs from index file
     * @param doc
     */
    private cleanupIndexesFromDoc;
    /**
     *
     * @param key
     * @param value
     * @param offset
     * @param pathPrefix - Object case for join prevous filed
     */
    private deleteFieldFromIndexes;
    /**
    * Append document to the Database
    * Also Update/Create indexes to the specfice index file
    *
    * @param {string} fileName - Name of the file to write with extenstion.
    * @return {Promise<void>}
    * @param {IndexEntry} doc - Object data we are going to insert
     */
    dataBaseInsert(fileName: string, ...docs: Partial<IndexEntry>[]): Promise<void>;
    /**
     * For nested object or array recursive iteration each element
     * For better index file name
     * Arrange way store all Offsets inside map
     * @param {any} value - The value store in our data base field
     * @param {number} offset - Database offset of the data
     * @param {string} basePath - name of our index file
     */
    private indexAllFields;
    /**
     * Write Doc fields value on index file
     * @param indexMap - Map of <field,Map<value,[offsets]>>
     */
    private writeIndexMap;
    /**
    For Index files
    Reads a binary file and extracts valid index blocks (tagged with 0xFD).
    Skips deleted blocks (tagged with 0xDE).
    
    * @param {string} fileName - Name of the file to read.
    * @return {Promise<IndexEntry | null>} - A fields indexs or null if not found
  */
    indexFind(fileName: string, value: string): Promise<IndexOut | null>;
    /**
   * Adds an index entry for a specific key and value pointing to a data offset.
   * If the value already exists in the index, the offset is added to its list.
   * If not, a new index entry is created and stored.
   *
   * @param {string} key - The field name to index (e.g. "name", "age").
   * @param {string | number | boolean} val - The actual value to index.
   * @param {number} offset - The byte offset of the corresponding record in the data file.
   */
    private indexField;
    /**
     * Appends a new index entry to the end of an index file.
     * The entry is encrypted and written with its offset information.
     *
     * @param {string} fileName - Name of the index file to write to.
     * @param {Partial<IndexEntry>} doc - The document to store (value-to-offset mapping).
     */
    private appendIndexEntry;
    /**
        * Delete main database field indexs update index file
        * @param fileName - name of file with extenstion
        * @param value - field value which is key of index file
        * @param dataBaseOffset - main database offset which is save on index file
        * @returns - void promise
        */
    private addFileIdxOffset;
    /**
   * Delete main database field indexs update index file
   * @param fileName - name of file with extenstion
   * @param value - field value which is key of index file
   * @param dataBaseOffset - main database offset which is save on index file
   * @returns - void promise
   */
    private deleteFileIdxOffset;
    /**
       * Mark as delete data and append new one
       * @param fileName - name of file with extenstion
       * @param offset - field value which is key of index file
       * @param doc - option if data pase then append it
       * @returns - void promise
       */
    makeAsDeleteAddNew(fileName: string, offset: number, doc?: Partial<IndexEntry>): Promise<void>;
    /**
        * @param {string} fileName - name of file path with extension
    */
    removeGarbage(fileName: string): Promise<void>;
}
