const fs = require("fs-extra");
const { ensureDir, pathExists, stat, readdir } = require("fs-extra");
const path = require("path");
const pairtree = require("pairtree");
const EventEmitter = require("events");
const { S3, Bucket } = require("./s3");
const OcflObjectFilesystemBackend = require("./ocflObject-filesystem-backend");

const DEPOSIT_DIR = "deposit";
const DIGEST_ALGORITHM = "sha512";
const OCFL_VERSION = "1.0";
const NAMASTE = `0=ocfl_${OCFL_VERSION}`;
const OBJECT_ID_TO_PATH = pairtree.path;
const allowedRepositoryBackends = ["filesystem", "S3"];

class Repository extends EventEmitter {
  constructor({ type = "filesystem", ocflRoot, ocflScratch, s3 }) {
    super();
    this.ocflVersion = "1.0";
    if (!allowedRepositoryBackends.includes(type)) {
      throw new Error(
        `Unsupported repository type: options are '${allowedRepositoryBackends.join(
          ", "
        )}'`
      );
    }
    this.backend = type;

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

      this.ocflObject = new OcflObjectFilesystemBackend({
        ocflRoot: this.ocflRoot,
        ocflScratch: this.ocflScratch,
        ocflVersion: OCFL_VERSION,
        digestAlgorithm: DIGEST_ALGORITHM,
        namaste: `0=ocfl_object_${OCFL_VERSION}`,
        objectIdToPath: OBJECT_ID_TO_PATH,
      });
    } else if (this.backend === "S3") {
      if (!ocflScratch) {
        console.warn(
          `You haven't defined 'ocflScratch' so you won't be able to operate on objects.`
        );
      }

      if (!s3.bucket) {
        throw new Error(`You must define a 'bucket' to use`);
      }
      this.ocflScratch = ocflScratch;
      this.bucket = new Bucket({ ...s3 });
      this.namaste = NAMASTE;
    }
  }

  //
  // PUBLIC API
  //

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
    if (this.backend === "S3") await this.__createS3Repository();
  }

  async isRepository() {
    if (this.backend === "filesystem") {
      return await fs.pathExists(this.namaste);
    } else if (this.backend === "S3") {
      let response = await this.bucket.listObjects({ path: this.namaste });
      return response ? response["$metadata"].httpStatusCode === 200 : false;
    }
  }

  async findObjects() {
    if (this.backend === "filesystem") {
      await this.__findObjectsFilesystemRepository({});
    } else if (this.backend === "S3") {
      //  not yet implemented
    }
  }

  //
  // PRIVATE API
  //

  __nameVersion(version) {
    return `ocfl__${version}`;
  }

  async __generateNamaste() {
    await fs.writeFile(this.namaste, this.ocflVersion);
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
      await this.__generateNamaste();
    }
  }

  async __createS3Repository() {
    // is there a namaste file in S3?
    let namaste = (await this.bucket.listObjects({ prefix: this.namaste }))
      .Contents;
    if (namaste?.length) {
      throw new Error(`The repository has already been initialised. `);
    }

    // is there any content in the bucket?
    let content = await this.bucket.listObjects({});
    if (content?.Contents?.length) {
      throw new Error(
        "Can't initialise a repository as there are already files."
      );
    }
  }

  async __findObjectsFilesystemRepository({ root }) {
    if (!root) root = this.ocflRoot;

    // Recursive function to find OCFL objects
    const dirs = await fs.readdir(root);
    for (let d of dirs) {
      const potentialObject = path.join(root, d);
      const stats = await fs.stat(potentialObject);
      if (stats.isDirectory()) {
        // Looks like an object
        if (potentialObject.match(DEPOSIT_DIR)) continue;
        if (
          await fs.pathExists(
            path.join(potentialObject, `0=ocfl_object_${this.ocflVersion}`)
          )
        ) {
          const objectConstructer = {
            ocflRoot: this.ocflRoot,
            objectPath: potentialObject.replace(this.ocflRoot, ""),
          };
          this.emit("object", objectConstructer);
        } else {
          this.__findObjectsFilesystemRepository({ root: potentialObject });
        }
      }
    }
  }
}

module.exports = Repository;
