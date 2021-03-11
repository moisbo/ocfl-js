const {
  stat,
  pathExists,
  readdir,
  ensureDir,
  copy,
  move,
  remove,
  readJSON,
} = require("fs-extra");
const path = require("path");
const { compact, orderBy, flattenDeep, difference, uniq } = require("lodash");

const OcflObjectParent = require("./ocflObject");

class OcflObject extends OcflObjectParent {
  constructor({
    ocflRoot,
    ocflScratch,
    ocflVersion,
    digestAlgorithm,
    namaste,
    inventoryType,
    objectIdToPath,
  }) {
    super();
    this.ocflRoot = path.resolve(ocflRoot);
    this.ocflScratch = ocflScratch ? path.resolve(ocflScratch) : undefined;
    this.ocflVersion = ocflVersion;
    this.digestAlgorithm = digestAlgorithm;
    this.namaste = namaste;
    this.inventoryType = inventoryType;
    this.objectIdToPath = objectIdToPath;
    this.contentVersion = null; // No content yet
    this.versions = null;
    this.id = null; // Not set yet
    this.updateMode = "update";
  }

  init({ id }) {
    // if (objectPath) {
    //   this.id = objectPath;
    //   this.repositoryPath = path.join(this.ocflRoot, objectPath);
    //   this.depositPath = path.join(
    //     this.ocflScratch,
    //     "deposit",
    //     objectPath.replace("/", "")
    //   );
    //   this.backupPath = path.join(
    //     this.ocflScratch,
    //     "backup",
    //     objectPath.replace("/", "")
    //   );
    // } else if (id && !objectPath) {

    let pairtreeId = this.objectIdToPath(id);
    this.pairtreeId = pairtreeId.endsWith("/")
      ? pairtreeId.slice(0, -1)
      : pairtreeId;
    this.id = id;
    this.repositoryPath = `${this.ocflRoot}${pairtreeId}`;
    this.depositPath = path.join(this.ocflScratch, "deposit", id);
    this.backupPath = path.join(this.ocflScratch, "backup", id);
    // } else {
    // this is where we would auto generate id's if we want to support this...
    // }
    this.depositPath = path.resolve(this.depositPath);
    this.repositoryPath = path.resolve(this.repositoryPath);
    this.backupPath = path.resolve(this.backupPath);
    this.activeObjectPath = this.repositoryPath;
    return this;
  }

  //
  // PUBLIC API
  //
  async commit({ inventory }) {
    let lastVersionInventory, currentVersionInventory;
    if (this.activeObjectPath === this.depositPath) {
      // we broke out of the update so verify the object
      //   to ensure that nothing has been added or removed
      let { isValid, errors } = await this.verify();
      if (!isValid) {
        console.log(errors);
        throw new Error(`The object does not verify. Aborting this commit.`);
      }
    }
    lastVersionInventory = inventory.head;
    if (lastVersionInventory) {
      // version n - write away!
      try {
        if (await pathExists(this.repositoryPath)) {
          if (this.updateMode === "update") {
            // temporarily move the original object if it exists
            await move(this.repositoryPath, this.backupPath);

            // move the deposit object to the repository
            await move(this.depositPath, this.repositoryPath);

            // remove the backup path
            await remove(this.backupPath);
          } else if (this.updateMode === "merge") {
            // sync the deposit object to the repo
            await this.__syncDepositToRepository({
              depositPath: this.depositPath,
              repositoryPath: this.repositoryPath,
            });
          }
        }

        // cleanup - remove deposit object and backed up original
        await remove(this.depositPath);
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

  async verify() {
    // Confirm that the inventoried files exists on disk and their hashes are correct
    let check = confirmInventoryMatchesDiskStructure.bind(this);
    let { isValid, errors } = await check();

    // Confirm that there are no extra files in the object that are not also inventoried
    check = confirmDiskStructureAlignsWithInventory.bind(this);
    let result = await check();
    if (!result.isValid) {
      isValid = result.isValid;
      errors = [...errors, ...result.errors];
    }

    return { isValid, errors };

    async function confirmDiskStructureAlignsWithInventory() {
      const versions = await this.getAllVersions();
      let expectedFiles = versions.map((version) => {
        return Object.keys(version.state).map((key) => version.state[key]);
      });
      expectedFiles = flattenDeep(expectedFiles);
      expectedFiles = expectedFiles.map((file) => file.path);
      expectedFiles = uniq(expectedFiles);

      let foundFiles = [];
      if (await pathExists(this.repositoryPath)) {
        await walk(this.repositoryPath, foundFiles);
        foundFiles = foundFiles.map((file) =>
          file.replace(`${this.repositoryPath}/`, "")
        );
      }
      if (await pathExists(this.depositPath)) {
        await walk(this.depositPath, foundFiles);
        foundFiles = foundFiles.map((file) =>
          file.replace(`${this.depositPath}/`, "")
        );
      }
      foundFiles = foundFiles.filter((file) => !file.match("inventory"));
      foundFiles = foundFiles.filter(
        (file) => !file.match("0=ocfl_object_1.0")
      );
      foundFiles = uniq(foundFiles);

      let extraFiles = difference(foundFiles.sort(), expectedFiles.sort());

      let isValid = true;
      let errors = [];
      extraFiles.forEach((file) => {
        isValid = false;
        errors.push(
          `The object has a file '${file}' that is not in the inventory`
        );
      });

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

    async function confirmInventoryMatchesDiskStructure() {
      const versions = await this.getAllVersions();
      let expectedFiles = versions.map((version) => {
        return Object.keys(version.state).map((key) => version.state[key]);
      });
      expectedFiles = flattenDeep(expectedFiles);

      let errors = [];
      let isValid = true;
      for (let file of expectedFiles) {
        let repoTarget = path.join(this.repositoryPath, file.path);
        let depositTarget = path.join(this.depositPath, file.path);
        // confirm that each expected file exists in repo or deposit
        if (
          !(await pathExists(repoTarget)) &&
          !(await pathExists(depositTarget))
        ) {
          isValid = false;
          errors.push(
            `'${file.path}' is inventoried but does not exist within the object`
          );
        } else {
          // confirm that the file hash matches the inventory
          let target = (await pathExists(repoTarget))
            ? repoTarget
            : depositTarget;
          if ((await this.__hash_file(target)) !== file.hash) {
            isValid = false;
            errors.push(
              `The hash for ${file.path} does not match the inventory`
            );
          }
        }
      }

      return { isValid, errors };
    }
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
      // copy the current object back to deposit in update mode
      //   in merge mode don't copy it back
      if (this.updateMode === "update") {
        await copy(this.repositoryPath, this.depositPath);
      } else if (this.updateMode === "merge") {
        let objectMetadataFiles = await readdir(this.repositoryPath);
        for (let file of objectMetadataFiles) {
          if ((await stat(path.join(this.repositoryPath, file))).isFile())
            await copy(
              path.join(this.repositoryPath, file),
              path.join(this.depositPath, file)
            );
        }
      }

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

  async __readJSON(target) {
    if (await this.__pathExists(target)) {
      return await readJSON(target);
    }
  }

  async __pathExists(path) {
    return await pathExists(path);
  }

  async __stat(path) {
    return await stat(path);
  }

  async __syncDepositToRepository({ depositPath, repositoryPath }) {
    let paths = [];
    const id = this.id;
    await walk({ root: depositPath, folder: depositPath });

    for (let path of paths) {
      if (path.type === "directory") {
        await ensureDir(path.target);
      } else {
        await copy(path.source, path.target);
      }
    }
    async function walk({ root, folder }) {
      let entries = await readdir(folder, { withFileTypes: true });
      let source, target;
      for (let entry of entries) {
        source = path.join(folder, entry.name);
        target = source
          .replace(path.join(path.dirname(root), "/"), "")
          .replace(`${id}/`, "");
        target = path.join(repositoryPath, target);
        paths.push({
          source,
          target,
          type: entry.isDirectory() ? "directory" : "file",
        });
        if (entry.isDirectory()) {
          await walk({ folder: path.join(folder, entry.name), root });
        }
      }
    }
  }
}
module.exports = OcflObject;
