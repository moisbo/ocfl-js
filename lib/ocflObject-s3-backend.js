const {
  stat,
  pathExists,
  readdir,
  ensureDir,
  remove,
  readJSON,
} = require("fs-extra");
const path = require("path");
const hasha = require("hasha");
const { compact, orderBy, flattenDepth, uniqBy } = require("lodash");

const OcflObjectParent = require("./ocflObject");

class OcflObject extends OcflObjectParent {
  constructor({
    bucket,
    ocflScratch,
    ocflVersion,
    digestAlgorithm,
    namaste,
    inventoryType,
  }) {
    super();
    this.bucket = bucket;
    this.ocflScratch = ocflScratch ? path.resolve(ocflScratch) : undefined;
    this.ocflVersion = ocflVersion;
    this.digestAlgorithm = digestAlgorithm;
    this.namaste = namaste;
    this.inventoryType = inventoryType;
    this.contentVersion = null; // No content yet
    this.versions = null;
    this.id = null; // Not set yet
    this.updateMode = "update";
    this.updateModes = ["update", "merge"];
  }

  init({ id }) {
    // if (objectPath) {
    //   this.id = objectPath;
    //   console.log(this.id);
    //   this.repositoryPath = objectPath;
    //   this.depositPath = path.join(this.ocflScratch, "deposit", objectPath);
    //   this.backupPath = path.join(this.ocflScratch, "backup", objectPath);
    // } else if (id && !objectPath) {
    // TODO check id is going to be S3 safe
    //  TODO: https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-keys.html
    this.id = id.endsWith("/") ? id.slice(0, -1) : id;
    this.repositoryPath = this.id;
    this.depositPath = path.join(this.ocflScratch, "deposit", id);
    this.backupPath = path.join(this.ocflScratch, "backup", id);
    // } else {
    // this is where we would auto generate id's if we want to support this...
    // }
    this.depositPath = path.resolve(this.depositPath);
    this.backupPath = path.resolve(this.backupPath);
    this.activeObjectPath = this.repositoryPath;
    return this;
  }

  //
  // PUBLIC API
  //

  async commit({ inventory }) {
    let lastVersionInventory;
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
        // sync the deposit object to the repository
        await this.bucket.syncLocalPathToBucket({
          localPath: this.depositPath,
        });

        // cleanup - remove deposit object and backed up original
        await remove(this.depositPath);
      } catch (error) {
        throw new Error("Error moving deposit object to repository.");
      }
    } else {
      // version 1 - write away!
      try {
        // move the deposit object to the repository
        await this.bucket.syncLocalPathToBucket({
          localPath: this.depositPath,
        });
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

    // if version is null and not all
    if (version !== "all") {
      if (!version) version = [...this.versions].pop().version;
      const inventory = await this.getInventory({ version });
      if (!inventory.versions[version]) {
        throw new Error("Can't export a version that doesn't exist.");
      }
      const state = inventory.versions[version].state;
      for (const hash of Object.keys(state)) {
        for (let file of state[hash]) {
          file = inventory.manifest[hash].filter((f) => f.match(file))[0];
          file = (
            await this.bucket.listObjects({
              prefix: `${this.id}/${file}`,
            })
          ).Contents[0];
          let localPath = path.join(
            target,
            file.Key.replace(/.*\/content\//, "")
          );
          await this.bucket.download({ target: file.Key, localPath });
        }
      }
    } else if (version === "all") {
      let files = (await this.bucket.listObjects({ prefix: this.id })).Contents;
      for (let file of files) {
        await this.bucket.download({ target: file.Key, localPath: target });
      }
    }
  }

  async isAvailable() {
    // return true if the objectPath is available to be used
    //  for an object
    let objects = (await this.bucket.listObjects({ prefix: this.id })).Contents;
    return objects?.length ? false : true;
  }

  async load() {
    // Tries to load an existing object residing at this.repositoryPath
    let objectPath = path.join(this.activeObjectPath, this.namaste);
    let stats;
    try {
      stats = await this.__pathExists(objectPath);
    } catch (error) {
      throw new Error(
        `${this.activeObjectPath} does not exist or is not a directory`
      );
    }
    let inventory = path.join(this.activeObjectPath, "inventory.json");
    inventory = await this.__readJSON(inventory);

    const versions = Object.keys(inventory.versions).map((version) => {
      return {
        version,
        created: inventory.versions[version].created,
      };
    });
    this.versions = orderBy(versions, (v) =>
      parseInt(v.version.replace("v", ""))
    );
  }

  async remove() {
    let result = await this.bucket.removeObjects({ prefix: this.id });
    if (result.httpStatusCode === 200) return null;
    throw new Error(`Error deleting that object with id '${this.id}'`);
  }

  async verify() {
    const self = this;
    const versions = await this.getAllVersions();
    let files = versions.map((version) => {
      let files = Object.keys(version.state).map((filename) => {
        return version.state[filename];
      });
      return flattenDepth(files, 1);
    });
    files = flattenDepth(files, 1);
    files = uniqBy(files, "path");

    let errors = [];
    for (let file of files) {
      // console.log(file);
      const { hash, name: filename, path: filepath } = file;

      // does it exist in the activeObjectPath?
      file = path.join(this.activeObjectPath, filepath);
      let exists = await check(file);
      if (!exists) {
        // does it exist in the repo path - two stage commit means
        //  we might only have part of the object locally
        file = path.join(this.repositoryPath, filepath);
        exists = await check(file);
      }
      // console.log(file, exists);
      if (!exists) {
        errors.push(
          `'${filepath}' is inventoried but does not exist within the object`
        );
      }
    }

    let result = await checkRepositoryPath();
    errors = [...errors, ...result.errors];
    if (!result.errors.length && (await pathExists(this.depositPath))) {
      result = await checkDepositPath();
      errors = [...errors, ...result.errors];
    }

    let isValid = errors.length ? false : true;
    return { isValid, errors };

    async function check(file) {
      let exists;
      if (path.isAbsolute(file)) {
        exists = await pathExists(file);
      } else {
        exists = await self.__pathExists(file);
      }
      return exists;
    }

    async function checkRepositoryPath() {
      let errors = [];
      let isValid = true;
      let walk = true;
      let continuationToken = undefined;
      while (walk) {
        let objects = await self.bucket.listObjects({
          prefix: self.repositoryPath,
          continuationToken,
        });
        let foundFiles = objects.Contents.filter((o) => {
          return !o.Key.match("inventory") && !o.Key.match("0=ocfl_object");
        }).map((f) => f.Key.replace(`${self.repositoryPath}/`, ""));

        foundFiles.forEach((ff) => {
          if (!files.filter((f) => f.path === ff).length) {
            isValid = false;
            errors.push(
              `The object has a file '${ff}' that is not in the inventory`
            );
          }
        });

        if (!objects.ContinuationToken) walk = false;
        continuationToken = objects.ContinuationToken;
        return { isValid, errors };
      }
    }

    async function checkDepositPath() {
      let filesFound = [];
      let isValid = true;
      let errors = [];
      await walk(self.depositPath, filesFound);
      filesFound = filesFound.filter((file) => !file.match("inventory"));
      filesFound = filesFound.filter(
        (file) => !file.match("0=ocfl_object_1.0")
      );
      for (let file of filesFound) {
        const match = files.filter(
          (f) => path.join(self.depositPath, f.path) === file
        );
        if (!match.length) {
          isValid = false;
          errors.push(
            `The object has a file '${path.relative(
              self.depositPath,
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
  }

  async getPresignedUrl({ version, target, expiresIn }) {
    target = path.join(this.repositoryPath, version, "content", target);
    return await this.bucket.getPresignedUrl({ target, expiresIn });
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
    if (await this.__pathExists(path.join(this.repositoryPath, this.namaste))) {
      // copy the current object back to deposit
      // await copy(this.repositoryPath, this.depositPath);

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

    // if there's only path we should be good to go
    if (pathComponents.length === 1) return false;

    let parentIsOcflObject = [];
    for (let p of pathComponents) {
      parentIsOcflObject.push(
        await this.__pathExists(path.join(p, this.namaste))
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
    if (this.activeObjectPath === this.repositoryPath) {
      if (await this.__pathExists(target)) {
        return await this.bucket.readJSON({ target });
      }
    } else if (this.activeObjectPath === this.depositPath) {
      if (await pathExists(target)) {
        return await readJSON(target);
      } else {
        // in two stage commit mode the activeObjectPath is the depositPath
        //   however, the deposit path might not have the whole object so
        //   this load will fail (pathExists = false)
        // so, in that case we need to go look for the file in the repo path
        target = target.split(`${this.depositPath}/`)[1];
        target = path.join(this.repositoryPath, target);
        return await this.bucket.readJSON({ target });
      }
    }
  }

  async __pathExists(path) {
    return await this.bucket.pathExists({ path });
  }

  async __stat(path) {
    return await this.bucket.stat({ path });
  }
}
module.exports = OcflObject;
