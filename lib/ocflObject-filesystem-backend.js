const {
  stat,
  pathExists,
  readdir,
  ensureDir,
  copy,
  move,
  remove,
  writeFile,
  readJSON,
  writeJSON,
} = require("fs-extra");
const path = require("path");
const hasha = require("hasha");
const {
  compact,
  flatten,
  flattenDeep,
  orderBy,
  groupBy,
  cloneDeep,
  isEqual,
  uniq,
  flattenDepth,
} = require("lodash");

class OcflObject {
  constructor({
    ocflRoot,
    ocflScratch,
    ocflVersion,
    digestAlgorithm,
    namaste,
    objectIdToPath,
  }) {
    this.ocflRoot = path.resolve(ocflRoot);
    this.ocflScratch = ocflScratch ? path.resolve(ocflScratch) : undefined;
    this.ocflVersion = ocflVersion;
    this.digestAlgorithm = digestAlgorithm;
    this.namaste = namaste;
    this.objectIdToPath = objectIdToPath;
    this.contentVersion = null; // No content yet
    this.versions = null;
    this.id = null; // Not set yet
  }

  init({ id, objectPath }) {
    if (objectPath) {
      this.id = objectPath;
      this.repositoryPath = path.join(this.ocflRoot, objectPath);
      this.depositPath = path.join(
        this.ocflScratch,
        "deposit",
        objectPath.replace("/", "")
      );
      this.backupPath = path.join(
        this.ocflScratch,
        "backup",
        objectPath.replace("/", "")
      );
    } else if (id && !objectPath) {
      id = this.objectIdToPath(id);
      this.id = id.endsWith("/") ? id.slice(0, -1) : id;
      this.repositoryPath = path.join(this.ocflRoot, this.id);
      this.depositPath = path.join(this.ocflScratch, "deposit", id);
      this.backupPath = path.join(this.ocflScratch, "backup", id);
    } else {
      // this is where we would auto generate id's if we want to support this...
    }
    this.depositPath = path.resolve(this.depositPath);
    this.repositoryPath = path.resolve(this.repositoryPath);
    this.backupPath = path.resolve(this.backupPath);
    this.activeObjectPath = this.repositoryPath;
    return this;
  }

  //
  // PUBLIC API
  //
  async update({ source = undefined, writer = undefined, commit = true }) {
    // only source OR writer (a callback) can be defined
    //  enforce this!
    if (source && writer)
      throw new Error("Specify only one of source or writer - not both.");

    // if neither - object to that too!
    if (!source && !writer)
      throw new Error("Specify at least one of source or writer.");

    // target will ALWAYS be the content folder relative to the deposit path
    //  it will either be v1 or the new version after the original
    //  object has been copied back in

    // version is the new version
    let version, target;
    ({ version, target } = await this.__initObject());

    // either invoke the callers writer method
    if (writer) {
      await writer({ target });
    } else if (source) {
      // or copy the content of source to the target folder
      await copy(source, target);
    }

    let {
      lastVersionInventory,
      currentVersionInventory,
    } = await this.__generateInventories({ version, target });
    if (!currentVersionInventory) return;

    let inventory = {
      head: lastVersionInventory,
      next: currentVersionInventory,
    };

    if (commit) {
      await this.commit({ inventory });
    } else {
      // set the master object path to the version in deposit
      this.activeObjectPath = this.depositPath;
      return { inventory };
    }
  }

  async commit({ inventory }) {
    let lastVersionInventory, currentVersionInventory;
    if (this.activeObjectPath === this.depositPath) {
      // we broke out of the update so verify the object
      //   to ensure that nothing has been added or removed
      let { isValid, errors } = await this.verify();
      if (!isValid) {
        throw new Error(`The object does not verify - abort!`);
      }
    }
    lastVersionInventory = inventory.head;
    if (lastVersionInventory) {
      // version n - write away!
      try {
        // temporarily move the original object if it exists
        if (await pathExists(this.repositoryPath))
          await move(this.repositoryPath, this.backupPath);

        // move the deposit object to the repository
        await move(this.depositPath, this.repositoryPath);

        // cleanup - remove deposit object and backed up original
        await remove(this.depositPath);
        await remove(this.backupPath);
      } catch (error) {
        throw new Error("Error moving deposit object to repository.");
      }
    } else {
      // version 1 - write away!
      try {
        // move the deposit object to the repository
        await move(this.depositPath, this.repositoryPath);
        await remove(this.depositPath);
      } catch (error) {
        throw new Error("Error moving deposit object to repository.");
      }
    }

    // set the master object path back to the version in the repo
    this.activeObjectPath = this.repositoryPath;

    // load the new set of versions
    await this.load();

    // load the latest version state
    await this.getLatestVersion();

    // return the object
    return this;
  }

  async diffVersions({ previous, next }) {
    const latestVersion = await this.getLatestVersion();
    const allVersions = await this.getAllVersions();
    if (!previous.match(/^v\d+$/)) {
      throw new Error(`previous can only be a version number like 'v1'`);
    }
    if (!next.match(/^v\d+$/)) {
      throw new Error(`next can only be a version number like 'v2'`);
    }
    if (
      parseInt(previous.replace("v", "") >= parseInt(next.replace("v", "")))
    ) {
      throw new Error(`previous must be less than next`);
    }

    previous = allVersions.filter((v) => v.version === previous)[0];
    next = allVersions.filter((v) => v.version === next)[0];

    previous = Object.keys(previous.state).map((filename) => {
      return previous.state[filename].map((e) => [e.path, e.hash]);
    });
    previous = flattenDepth(previous, 1);
    next = Object.keys(next.state).map((filename) => {
      return next.state[filename].map((e) => [e.path, e.hash]);
    });
    next = flattenDepth(next, 1);

    const diff = {
      same: [],
      previous: [],
      next: [],
    };

    // comparisons have to use filename and hash - check previous against next
    previous.forEach((i) => {
      const m = next.filter((j) => `${i[0]}${i[1]}` === `${j[0]}${j[1]}`);
      if (m.length) {
        diff.same.push(i[0]);
      } else {
        diff.previous.push(i[0]);
      }
    });

    // comparisons have to use filename and hash - check next against previous
    next.forEach((i) => {
      const m = previous.filter((j) => `${i[0]}${i[1]}` === `${j[0]}${j[1]}`);
      if (m.length) {
        diff.same.push(i[0]);
      } else {
        diff.next.push(i[0]);
      }
    });
    diff.same = uniq(diff.same);
    diff.previous = uniq(diff.previous);
    diff.next = uniq(diff.next);
    return { ...diff };
  }

  async export({ target, version = null }) {
    // can we use the target? does the folder exist and is it empty?
    if (!(await pathExists(target))) {
      throw new Error(`Export target folder doesn't exist.`);
    }
    if ((await readdir(target)).length) {
      throw new Error(`Export target folder isn't empty.`);
    }
    await this.load();

    // if version not defined - get the head version
    if (!version) version = [...this.versions].pop().version;
    const inventory = await this.getInventory({ version });
    if (!inventory.versions[version]) {
      throw new Error("Can't export a version that doesn't exist.");
    }
    const state = inventory.versions[version].state;
    for (const hash of Object.keys(state)) {
      // Hashes point to arrays of paths
      for (const f of state[hash]) {
        const fileExportTo = path.join(target, f);
        const fileExportFrom = path.join(
          this.repositoryPath,
          inventory.manifest[hash][0]
        );
        await copy(fileExportFrom, fileExportTo);
      }
    }
  }

  async verify() {
    const versions = await this.getAllVersions();
    let files = versions.map((version) => {
      let files = Object.keys(version.state).map((filename) => {
        return version.state[filename];
      });
      return flattenDepth(files, 1);
    });
    files = flattenDepth(files, 1);

    let isValid = true;
    let errors = [];
    for (let file of files) {
      // console.log(file);
      const { hash, name: filename, path: filepath } = file;
      file = path.join(this.activeObjectPath, filepath);
      if (await pathExists(file)) {
        if ((await this.__hash_file(file)) !== hash) {
          errors.push(`The hash for ${filepath} does not match the inventory`);
          isValid = false;
        }
      } else {
        errors.push(
          `'${filepath}' is inventoried but does not exist within the object`
        );
        isValid = false;
      }
    }

    let filesFound = [];
    await walk(this.activeObjectPath, filesFound);
    filesFound = filesFound.filter((file) => !file.match("inventory"));
    filesFound = filesFound.filter((file) => !file.match("0=ocfl_object_1.0"));
    for (let file of filesFound) {
      const match = files.filter(
        (f) => path.join(this.activeObjectPath, f.path) === file
      );
      if (!match.length) {
        isValid = false;
        errors.push(
          `The object has a file '${path.relative(
            this.activeObjectPath,
            file
          )}' that is not in the inventory`
        );
      }
    }

    return { isValid, errors };

    async function walk(dir, files) {
      for (let entry of await readdir(dir)) {
        entry = path.join(dir, entry);
        if ((await stat(entry)).isDirectory()) {
          await walk(entry, files);
        } else {
          files.push(entry);
        }
      }
    }
  }

  async isObject() {
    // TODO: Check if this content root with NAMASTE and returns ocfl version
    // 0=ocfl_object_1.0
    // looks at path and see if the content of the file is
    // TODO: Make this look for a namaste file beginning with 0=ocfl_object_ and extract the version
    return await pathExists(path.join(this.activeObjectPath, this.namaste));
  }

  async isAvailable() {
    // return true if the objectPath is available to be used
    //  for an object
    if (!(await pathExists(this.repositoryPath))) return true;
    let stats = await stat(this.repositoryPath);
    if (stats.isDirectory()) {
      const ocflVersion = await this.isObject(this.repositoryPath);
      const content = await readdir(this.repositoryPath);
      if (ocflVersion || content.length) return false;
    } else {
      return false;
    }
    return true;
  }

  async load() {
    // Tries to load an existing object residing at this.repositoryPath
    let stats;
    try {
      stats = await stat(this.activeObjectPath);
    } catch (error) {
      throw new Error(
        `${this.activeObjectPath} does not exist or is not a directory`
      );
    }
    if ((await pathExists(this.activeObjectPath)) && stats.isDirectory()) {
      const ocflVersion = await this.isObject(this.activeObjectPath);
      if (!ocflVersion) {
        throw new Error(`This path doesn't look like an OCFL object`);
      }
      let inventory = path.join(this.activeObjectPath, "inventory.json");
      inventory = await readJSON(inventory);

      const versions = Object.keys(inventory.versions).map((version) => {
        return {
          version,
          created: inventory.versions[version].created,
        };
      });
      this.versions = orderBy(versions, (v) =>
        parseInt(v.version.replace("v", ""))
      );
    } else {
      throw new Error(`${this.path} does not exist or is not a directory`);
    }
  }

  async remove() {
    await remove(this.activeObjectPath);
    return null;
  }

  getVersions() {
    return cloneDeep(this.versions);
  }

  async getAllVersions() {
    for (let version of this.versions) {
      for (let v of this.versions) {
        await this.getVersion({ version: v.version });
      }
    }
    return cloneDeep(this.versions);
  }

  async getVersion({ version }) {
    if (version === "latest") {
      version = [...this.versions].pop().version;
    }
    let inventory = path.join(this.activeObjectPath, version, "inventory.json");
    try {
      inventory = await readJSON(inventory);
    } catch (error) {
      throw new Error("Unable to load version inventory.");
    }
    let files = [];
    for (let hash of Object.keys(inventory.manifest)) {
      let items = inventory.manifest[hash];
      files.push(
        items.map((item) => {
          return {
            name: item.split("/").pop(),
            path: item,
            hash,
            version: parseInt(item.split("/").shift().replace("v", "")),
          };
        })
      );
    }
    files = flattenDeep(files);
    files = groupBy(files, "name");
    for (let file of Object.keys(files)) {
      files[file] = orderBy(files[file], "version");
    }

    this.versions = this.versions.map((v) => {
      if (v.version === version) v.state = files;
      return v;
    });
    return this.versions.filter((v) => v.version === version)[0];
  }

  getLatestVersion() {
    let latestVersion = cloneDeep(this.versions).pop();
    if (latestVersion.state) return latestVersion;
    return this.getVersion({ version: latestVersion.version });
  }

  async getInventory({ version }) {
    const inventoryPath = path.join(
      this.activeObjectPath,
      version,
      "inventory.json"
    );
    if (await pathExists(inventoryPath)) {
      return await readJSON(inventoryPath);
    } else {
      return null;
    }
  }

  async getLatestInventory() {
    const inventoryPath = path.join(this.activeObjectPath, "inventory.json");
    if (await pathExists(inventoryPath)) {
      return await readJSON(inventoryPath);
    } else {
      return null;
    }
  }

  resolveFilePath({ filePath }) {
    return path.join(this.activeObjectPath, filePath);
  }

  //
  // PRIVATE METHODS
  //

  async __initObject() {
    // check deposit to see if this object is already being operated on
    if (await pathExists(this.depositPath))
      throw new Error("An object with that ID is already in the deposit path.");

    // ensure the object is not the child of another object
    if (await this.__isChildOfAnotherObject())
      throw new Error(
        `This object is a child of an existing object and that's not allowed.`
      );

    // if not - init the deposit path
    await ensureDir(this.depositPath);

    // check if this object is in the repo and sync the content back to deposit
    if (await pathExists(this.repositoryPath)) {
      // copy the current object back to deposit
      await copy(this.repositoryPath, this.depositPath);

      // add the next version path
      const latestInventory = await this.getLatestInventory();
      const nextVersion =
        "v" + (parseInt(latestInventory.head.replace("v", "")) + 1);
      const versionPath = path.join(this.depositPath, nextVersion, "/content");
      await ensureDir(versionPath);

      return { version: nextVersion, target: versionPath };
    } else {
      // init deposit with a version 1
      await this.__generateNamaste();
      const versionPath = path.join(this.depositPath, "v1/content");
      await ensureDir(versionPath);
      return { version: "v1", target: versionPath };
    }
  }

  async __isChildOfAnotherObject() {
    // this path cannot be the child of another object
    //  we can determine that by walking back up the path and looking
    //  for an "0=" + this.nameVersion(this.ocflVersion) file
    const pathComponents = compact(this.repositoryPath.split("/"));

    // ditch the final path element - we're only checking parents
    //  so by definition, the final path element is the one we're on
    pathComponents.pop();
    if (pathComponents.length === 1) {
      // we must be at the ocflRoot so we're ok to continue
      return false;
    }
    let parentIsOcflObject = [];
    let objectPath = pathComponents.shift();
    for (let p of pathComponents) {
      objectPath = path.join(objectPath, p);
      parentIsOcflObject.push(
        await pathExists(path.join(objectPath, this.namaste))
      );
    }
    return parentIsOcflObject.includes(true);
  }

  async __initialiseInventory({ version, target }) {
    const inv = {
      id: this.id,
      type: "https://ocfl.io/1.0/spec/#inventory",
      digestAlgorithm: this.DIGEST_ALGORITHM,
      head: version,
      versions: {},
    };
    inv.versions[version] = {
      created: new Date().toISOString(),
      state: {},
    };
    // TODO Message and state keys in version
    var hashpairs = await this.__digest_dir(target);
    var versionState = inv.versions[version].state;
    inv["manifest"] = {};
    for (let i = 0; i < hashpairs.length; i += 2) {
      const thisHash = hashpairs[i + 1];
      const thisPath = path.relative(this.depositPath, hashpairs[i]);
      const versionPath = path.relative(
        path.join(version, "content"),
        thisPath
      );
      if (!inv.manifest[thisHash]) {
        inv.manifest[thisHash] = [thisPath];
      } else {
        inv.manifest[thisHash].push(thisPath);
      }

      if (!versionState[thisHash]) {
        versionState[thisHash] = [versionPath];
      } else {
        versionState[thisHash].push(versionPath);
      }
    }
    return inv;
  }

  async __generateInventories({ version, target }) {
    // get last inventory
    let lastVersionInventory = await this.getLatestInventory();

    // initialiase the current inventory off the new version
    let currentVersionInventory = await this.__initialiseInventory({
      version,
      target,
    });

    // if there's a last inventory - ie this isn't a version 1
    if (lastVersionInventory) {
      // generate a current version inventory relative to the previous
      //  inventory - that is, remove new files that haven't changed and map
      //  those back in to the previous version.
      currentVersionInventory = await this.__generateCurrentInventory({
        lastVersionInventory,
        currentVersionInventory,
        target,
      });
      // console.log("*** last version inventory", lastVersionInventory);
      // console.log("*** current version inventory", currentVersionInventory);

      // if null - no change - resolve()
      if (!currentVersionInventory) {
        return { currentVersionInventory: null, lastVersionInventory };
      }

      // version n - write away!
      await this.__writeVersion({
        inventory: currentVersionInventory,
      });
    } else {
      // version 1 - write away!
      await this.__writeVersion1({
        inventory: currentVersionInventory,
      });
    }
    return { lastVersionInventory, currentVersionInventory };
  }

  async __writeInventories({ inventory }) {
    // write root inventory and inventory hash file
    let inventoryFile = path.join(this.depositPath, "inventory.json");
    await writeJSON(inventoryFile, inventory, { spaces: 2 });
    const inventoryHash = await this.__hash_file(inventoryFile);
    await writeFile(
      `${inventoryFile}.${this.DIGEST_ALGORITHM}`,
      `${inventoryHash}   inventory.json`
    );

    // write version inventory and inventory hash file
    inventoryFile = path.join(
      this.depositPath,
      inventory.head,
      "inventory.json"
    );
    await writeJSON(inventoryFile, inventory, { spaces: 2 });
    await writeFile(
      `${inventoryFile}.${this.DIGEST_ALGORITHM}`,
      `${inventoryHash}   inventory.json`
    );
  }

  async __writeVersion1({ inventory }) {
    // Put the inventory in the root AND version folder
    await this.__writeInventories({ inventory });
    this.contentVersion = inventory.head;
  }

  async __writeVersion({ inventory }) {
    // put the inventory in the root AND version folder
    await this.__writeInventories({ inventory });
    this.contentVersion = inventory.head;
  }

  async __generateCurrentInventory({
    lastVersionInventory,
    currentVersionInventory,
    target,
  }) {
    let manifest = {};

    // iterate over currentVersionInventory manifest entries
    for (let entry of Object.entries(currentVersionInventory.manifest)) {
      let hash = entry[0];
      const currentVersionFiles = entry[1];
      const lastVersionFiles = lastVersionInventory.manifest[hash] || [];

      // figure out whether the files are the same, new or deleted.
      let files = await this.__processFiles({
        currentVersion: currentVersionInventory.head,
        depositPath: this.depositPath,
        currentVersionFiles,
        lastVersionFiles,
      });
      manifest[hash] = files;
    }

    // udpate the currentVersionInventory manifest
    currentVersionInventory.manifest = manifest;

    // remove empty version folders
    await this.__removeEmptyDirectories({
      folder: target,
    });

    // return if there's no change to the object
    const lastVersionManifestHash = hasha(
      JSON.stringify(lastVersionInventory.manifest)
    );
    const currentVersionManifestHash = hasha(
      JSON.stringify(currentVersionInventory.manifest)
    );
    if (lastVersionManifestHash === currentVersionManifestHash) {
      await remove(this.depositPath);
      return null;
    }

    // otherwise - map the old versions in to the current inventory
    currentVersionInventory.versions = {
      ...lastVersionInventory.versions,
      ...currentVersionInventory.versions,
    };

    // return the verified currentVersionInventory
    return currentVersionInventory;
  }

  async __processFiles({
    currentVersion,
    depositPath,
    currentVersionFiles,
    lastVersionFiles,
  }) {
    let files = [...currentVersionFiles, ...lastVersionFiles];

    // group files by their relative paths with version stripped off
    files = groupBy(files, (file) => file.split("/").slice(1).join("/"));

    // expect to see something like
    /*
        { 
          'content/file1.txt': [ 'v5/content/file1.txt', 'v4/content/file1.txt' ],
          'content/file2.txt': [ 'v3/content/file2.txt' ] 
        }
      */

    // iterate over the file list and remove anything that doesn't have a current version
    //  that's a file that has been removed so we don't want to return that to the manifest
    for (let file of Object.keys(files)) {
      let hasCurrentVersion = files[file].filter((f) =>
        f.match(currentVersion)
      );
      if (!hasCurrentVersion.length) delete files[file];
    }

    // expect to see something like - note file2 is not there
    /*
        { 
          'content/file1.txt': [ 'v5/content/file1.txt', 'v4/content/file1.txt' ],
        }
      */

    // iterate over the remaining file list and pick out the earliest version
    //  of each file and return that.
    //
    // if there's only one version - then return that as it's a new file
    let remappedFiles = [];
    for (let file of Object.keys(files)) {
      // two versions - remove the first (newest - remember, the hash is the same)
      if (files[file].length === 2) {
        await remove(path.join(depositPath, files[file].shift()));
      }
      // return whatever is left - this could be either the older of two versions
      //  or a single version if it's a new file
      remappedFiles.push(...files[file]);
    }
    return remappedFiles;
  }

  __nameVersion() {
    return `ocfl_object_${this.ocflVersion}`;
  }

  async __generateNamaste() {
    const namasteFile = path.join(this.depositPath, this.namaste);
    await writeFile(namasteFile, this.__nameVersion());
  }

  async __digest_dir(dir) {
    var items = {};
    const contents = await readdir(dir);
    items = flatten(
      await Promise.all(
        contents.map(async (p1) => {
          const p = path.join(dir, p1);
          const stats = await stat(p);
          if (stats.isDirectory()) {
            return await this.__digest_dir(p);
          } else {
            const h = await this.__hash_file(p);
            return [p, h];
          }
        })
      )
    );
    return items;
  }

  async __hash_file(p) {
    const hash = await hasha.fromFile(p, { algorithm: this.digestAlgorithm });
    return hash;
  }

  async __removeEmptyDirectories({ folder }) {
    // Remove empty directories
    // Adapted (nade async) from: https://gist.github.com/jakub-g/5903dc7e4028133704a4
    if (!folder) folder = this.depositPath;
    const stats = await stat(folder);
    var isDir = await stats.isDirectory();
    if (isDir) {
      var files = await readdir(folder);
      if (files.length > 0) {
        for (let f of files) {
          var fullPath = path.join(folder, f);
          await this.__removeEmptyDirectories({ folder: fullPath });
        }
        files = await readdir(folder);
      }
      if (!files.length) await remove(folder);
    }
  }
}
module.exports = OcflObject;
