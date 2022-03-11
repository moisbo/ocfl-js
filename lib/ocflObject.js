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
  uniqBy,
  flattenDepth,
} = require("lodash");

class OcflObject {
  constructor() {
    this.updateModes = ["update", "merge"];
  }

  //
  // PUBLIC API
  //
  async update({
    source = undefined,
    writer = undefined,
    commit = true,
    updateMode,
    removeFiles = [],
  }) {
    if (!updateMode) {
      updateMode = this.bucket ? "merge" : "update";
    }
    if (!this.updateModes.includes(updateMode)) {
      throw new Error(
        `Unsupported update mode specified. Options are 'update' (default) or 'merge'`
      );
    }
    this.updateMode = updateMode;

    // only source OR writer (a callback) or removeFiles can be defined
    //  enforce this!
    if (source ? writer || removeFiles?.length : writer && removeFiles?.length)
      throw new Error(
        "Specify only one of 'source', 'writer' or 'removeFiles'."
      );

    // if neither - object to that too!
    if (!source && !writer && !removeFiles?.length)
      throw new Error(
        "Specify at least one of 'source', 'writer' or 'removeFiles'."
      );

    // object if activeObjectPath === depositPath
    if (this.activeObjectPath === this.depositPath) {
      throw new Error(
        `This object is already in deposit. If this is a two stage update commit the last changes before updating again.`
      );
    }

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
    } else if (removeFiles?.length) {
      this.updateMode = "merge";
    }

    let {
      lastVersionInventory,
      currentVersionInventory,
    } = await this.__generateInventories({ version, target, removeFiles });
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
      await this.load();
      return { inventory };
    }
  }

  async diffVersions({ previous, next }) {
    if (!previous?.match(/^v\d+$/)) {
      throw new Error(`previous can only be a version number like 'v1'`);
    }
    if (!next?.match(/^v\d+$/)) {
      throw new Error(`next can only be a version number like 'v2'`);
    }
    if (
      parseInt(previous.replace("v", "") >= parseInt(next.replace("v", "")))
    ) {
      throw new Error(`previous must be less than next`);
    }

    const allVersions = await this.getAllVersions();

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

  async isObject() {
    // TODO: Check if this content root with NAMASTE and returns ocfl version
    // 0=ocfl_object_1.0
    // looks at path and see if the content of the file is
    // TODO: Make this look for a namaste file beginning with 0=ocfl_object_ and extract the version
    return await this.__pathExists(
      path.join(this.activeObjectPath, this.namaste)
    );
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

  getVersions() {
    return cloneDeep(this.versions);
  }

  async getAllVersions() {
    for (let v of this.versions) {
      await this.getVersion({ version: v.version });
    }
    return cloneDeep(this.versions);
  }

  async getVersion({ version }) {
    if (version === "latest") {
      version = [...this.versions].pop().version;
    }
    let inventory = path.join(this.activeObjectPath, version, "inventory.json");
    try {
      inventory = await this.__readJSON(inventory);
    } catch (error) {
      throw new Error("Unable to load version inventory.");
    }
    let files = [];
    for (let hash of Object.keys(inventory.manifest)) {
      let items = inventory.manifest[hash];
      files.push(
        items.map((item) => {
          return {
            name: item.replace(/^v\d+\/content\//, ''),
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
    return await this.__readJSON(inventoryPath);
  }

  async getLatestInventory() {
    const inventoryPath = path.join(this.activeObjectPath, "inventory.json");
    return await this.__readJSON(inventoryPath);
  }

  resolveFilePath({ filePath }) {
    return path.join(this.activeObjectPath, filePath);
  }

  //
  // PRIVATE METHODS
  //

  async __initialiseInventory({
    version,
    target,
    lastVersionInventory,
    removeFiles,
  }) {
    const inv = {
      id: this.id,
      type: this.inventoryType,
      digestAlgorithm: this.digestAlgorithm,
      head: version,
      versions: {},
    };
    inv.versions[version] = {
      created: new Date().toISOString(),
      state: {},
    };
    let versionState = inv.versions[version].state;
    inv.manifest = {};

    // digest the directory of content
    let content = await this.__digest_dir(target);

    // if the update mode is merge pull in all existing stuff as well
    if (this.updateMode === "merge" && lastVersionInventory) {
      for (let hash of Object.keys(lastVersionInventory.manifest)) {
        for (let file of lastVersionInventory.manifest[hash]) {
          file = path.resolve(path.join(this.depositPath, file));
          const re = RegExp(/\/v\d+\/content(.*)/);
          let result = re.exec(file);
          file = `${file.split(result[0])[0]}/${version}/content${result[1]}`;
          content.push({ hash, path: file });
        }
      }
      content = uniqBy(content, (v) => `${v.hash}${v.path}`);

      // and in the case of removing file - remove them here
      if (removeFiles?.length) {
        content = content.filter((entry) => {
          let filename = entry.path.split("/content/").pop();
          if (!removeFiles.includes(filename)) return entry;
        });
      }
    }
    content.forEach((entry) => {
      const hash = entry.hash;
      const entryPath = path.relative(this.depositPath, entry.path);
      const versionPath = path.relative(
        path.join(version, "content"),
        entryPath
      );

      if (!inv.manifest[hash]) {
        inv.manifest[hash] = [];
      }
      inv.manifest[hash].push(entryPath);

      if (!versionState[hash]) {
        versionState[hash] = [];
      }
      versionState[hash].push(versionPath);
    });
    return inv;
  }

  async __generateInventories({ version, target, removeFiles }) {
    // get last inventory
    let lastVersionInventory = await this.getLatestInventory();

    // initialiase the current inventory off the new version
    let currentVersionInventory = await this.__initialiseInventory({
      version,
      target,
      lastVersionInventory:
        this.updateMode === "merge" ? lastVersionInventory : undefined,
      removeFiles,
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

      // if null - no change - resolve()
      if (!currentVersionInventory) {
        return { currentVersionInventory: null, lastVersionInventory };
      }

      // version n - write away!
      // await this.__writeVersion({
      //   inventory: currentVersionInventory,
      // });
      // } else {
      //   // version 1 - write away!
      //   await this.__writeVersion1({
      //     inventory: currentVersionInventory,
      //   });
    }
    await this.__writeVersion({
      inventory: currentVersionInventory,
    });
    // console.log(
    //   "lastVersionInventory",
    //   JSON.stringify(lastVersionInventory, null, 2)
    // );
    // console.log(
    //   "currentVersionInventory",
    //   JSON.stringify(currentVersionInventory, null, 2)
    // );
    return { lastVersionInventory, currentVersionInventory };
  }

  async __writeInventories({ inventory }) {
    // write root inventory and inventory hash file
    let inventoryFile = path.join(this.depositPath, "inventory.json");
    await writeJSON(inventoryFile, inventory, { spaces: 2 });
    const inventoryHash = await this.__hash_file(inventoryFile);
    await writeFile(
      `${inventoryFile}.${this.digestAlgorithm}`,
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
      `${inventoryFile}.${this.digestAlgorithm}`,
      `${inventoryHash}   inventory.json`
    );
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
            return { path: p, hash: h };
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
