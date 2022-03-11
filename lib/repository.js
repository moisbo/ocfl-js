const { pathExists, stat, readdir, writeFile, readJSON } = require("fs-extra");
const path = require("path");
const pairtree = require("pairtree");
const EventEmitter = require("events");
const { Bucket } = require("./s3");
const OcflObjectFilesystemBackend = require("./ocflObject-filesystem-backend");
const OcflObjectS3Backend = require("./ocflObject-s3-backend");

const DEPOSIT_DIR = "deposit";
const DIGEST_ALGORITHM = "sha512";
const OCFL_VERSION = "1.0";
const NAMASTE = `0=ocfl_${OCFL_VERSION}`;
const OBJECT_ID_TO_PATH = (id) => pairtree.path(hasha(id, { algorithm: 'md5' })); // TODO: Should be an extension to avoid clashes in paths
const INVENTORY_TYPE = `https://ocfl.io/${OCFL_VERSION}/spec/#inventory`;
const allowedRepositoryBackends = ["filesystem", "s3"];

class Repository extends EventEmitter {
  constructor({ type = "filesystem", ocflRoot, ocflScratch, s3 }) {
    super();
    this.ocflVersion = "1.0";
    if (!allowedRepositoryBackends.includes(type.toLowerCase())) {
      throw new Error(
        `Unsupported repository type: options are '${allowedRepositoryBackends.join(
          ", "
        )}'`
      );
    }
    this.backend = type.toLowerCase();

    if (this.backend === "filesystem") {
      if (!ocflRoot) {
        throw new Error(`You must define 'ocflRoot'`);
      }
      if (!ocflScratch) {
        console.warn(
          `You haven't defined 'ocflScratch' so you won't be able to operate on objects.`
        );
      }

      this.ocflRoot = ocflRoot;
      this.ocflScratch = ocflScratch;
      this.namaste = path.join(this.ocflRoot, NAMASTE);
    } else if (this.backend === "s3") {
      if (!ocflScratch) {
        console.warn(
          `You haven't defined 'ocflScratch' so you won't be able to operate on objects.`
        );
      }

      if (!s3.bucket) {
        throw new Error(`You must define a 'bucket' to use this backend`);
      }
      this.ocflScratch = ocflScratch;
      this.bucket = new Bucket({ ...s3 });
      this.namaste = NAMASTE;
    }
  }

  //
  // PUBLIC API
  //

  object({ id }) {
    let object;
    if (this.backend === "filesystem") {
      object = new OcflObjectFilesystemBackend({
        ocflRoot: this.ocflRoot,
        ocflScratch: this.ocflScratch,
        ocflVersion: OCFL_VERSION,
        digestAlgorithm: DIGEST_ALGORITHM,
        namaste: `0=ocfl_object_${OCFL_VERSION}`,
        inventoryType: INVENTORY_TYPE,
        objectIdToPath: OBJECT_ID_TO_PATH,
      });
    } else if (this.backend === "s3") {
      object = new OcflObjectS3Backend({
        bucket: this.bucket,
        ocflScratch: this.ocflScratch,
        ocflVersion: OCFL_VERSION,
        digestAlgorithm: DIGEST_ALGORITHM,
        namaste: `0=ocfl_object_${OCFL_VERSION}`,
        inventoryType: INVENTORY_TYPE,
      });
    }
    return object.init({ id });
  }

  async create() {
    if (
      this.ocflRoot &&
      this.ocflScratch &&
      this.ocflScratch.match(this.ocflRoot)
    ) {
      throw new Error(`'ocflScratch' cannot be a subpath of 'ocflRoot'`);
    }
    if (!(await pathExists(this.ocflScratch))) {
      throw new Error(
        `The OCFL scratch directory '${this.ocflScratch}' doesn't exist.`
      );
    }

    if (this.backend === "filesystem")
      await this.__createFilesystemRepository();
    if (this.backend === "s3") await this.__createS3Repository();
  }

  async isRepository() {
    if (this.backend === "filesystem") {
      return await pathExists(this.namaste);
    } else if (this.backend === "s3") {
      let response = await this.bucket.listObjects({ prefix: this.namaste });
      return response?.Contents?.length !== undefined ? true : false;
    }
  }

  async findObjects() {
    if (this.backend === "filesystem") {
      await this.__findObjectsFilesystemRepository({});
    } else if (this.backend === "s3") {
      await this.__findObjectsS3Repository();
    }
  }

  //
  // PRIVATE API
  //

  __nameVersion(version) {
    return `ocfl__${version}`;
  }

  async __createFilesystemRepository() {
    if (!(await pathExists(this.ocflRoot))) {
      throw new Error(
        `The OCFL root directory '${this.ocflRoot}' doesn't exist.`
      );
    }

    const stats = await stat(this.ocflRoot);
    if (stats.isDirectory()) {
      if (await pathExists(this.namaste)) {
        throw new Error("This repository has already been initialized.");
      }

      const content = await readdir(this.ocflRoot);
      if (content.length !== 0) {
        throw new Error(
          "Can't initialise a repository as there are already files."
        );
      }

      // empty - initialise a repo here
      await writeFile(this.namaste, this.ocflVersion);
    }
  }

  async __createS3Repository() {
    // is there a namaste file in S3?
    let namaste = await this.bucket.listObjects({ prefix: this.namaste });
    if (namaste?.length) {
      throw new Error(`This repository has already been initialized.`);
    }

    // is there any content in the bucket?
    let content = await this.bucket.listObjects({});
    if (content?.length) {
      throw new Error(
        "Can't initialise a repository as there are already files."
      );
    }

    //  empty - initialise a repo here
    await this.bucket.upload({ target: this.namaste, content: this.namaste });
  }

  async __findObjectsFilesystemRepository({ root }) {
    if (!root) root = this.ocflRoot;

    // Recursive function to find OCFL objects
    const dirs = await readdir(root);
    for (let d of dirs) {
      const potentialObject = path.join(root, d);
      const stats = await stat(potentialObject);
      if (stats.isDirectory()) {
        // Looks like an object
        if (potentialObject.match(DEPOSIT_DIR)) continue;
        if (
          await pathExists(
            path.join(potentialObject, `0=ocfl_object_${this.ocflVersion}`)
          )
        ) {
          let files = await readdir(potentialObject);
          if (files.includes("inventory.json")) {
            let inventory = await readJSON(
              path.join(potentialObject, "inventory.json")
            );

            let object = this.object({ id: inventory.id });
            this.emit("object", object);
          }
        } else {
          this.__findObjectsFilesystemRepository({ root: potentialObject });
        }
      }
    }
  }

  async __findObjectsS3Repository() {
    // console.log(this.bucket);
    let walk = true;
    let continuationToken = undefined;
    while (walk) {
      let objects = await this.bucket.listObjects({ continuationToken });
      objects.Contents.forEach((entry) => {
        if (entry.Key.match(/.*\/0=ocfl_object_1.0/)) {
          this.emit("object", { objectPath: entry.Key.split("/")[0] });
        }
      });
      if (objects.NextContinuationToken) {
        continuationToken = objects.NextContinuationToken;
      } else {
        walk = false;
      }
    }
  }
}

module.exports = Repository;
