const fs = require("fs-extra");
const path = require("path");
const pairtree = require("pairtree");
const EventEmitter = require("events");

const DEPOSIT_DIR = "deposit";

class Repository extends EventEmitter {
  constructor({ ocflRoot }) {
    super();
    this.ocflVersion = "1.0";
    this.ocflRoot = ocflRoot;
    this.namaste = path.join(this.ocflRoot, `0=ocfl_${this.ocflVersion}`);
    // For now we only put things on pairtree paths
    this.objectIdToPath = pairtree.path;
  }

  //
  // PUBLIC API
  //

  async create() {
    // Sets up an empty repository
    if (await fs.pathExists(this.ocflRoot)) {
      const stats = await fs.stat(this.ocflRoot);
      if (stats.isDirectory()) {
        if (await fs.pathExists(this.namaste)) {
          throw new Error("This repository has already been initialized.");
        }

        const readDir = await fs.readdir(this.ocflRoot);
        if (readDir.length <= 0) {
          // empty so initialise a repo here
          await this.__generateNamaste();
        } else {
          throw new Error(
            "Can't initialise a repository as there are already files."
          );
        }
      }
    } else {
      //else if dir doesn't exist it dies
      throw new Error("Directory does not exist");
    }
  }

  async isRepository() {
    return await fs.pathExists(this.namaste);
  }

  async findObjects({ root }) {
    if (!root) root = this.ocflRoot;

    // Recursive function to find OCFL objects
    const dirs = await fs.readdir(root);
    for (let d of dirs) {
      const potentialObject = path.join(root, d);
      const stats = await fs.stat(potentialObject);
      if (stats.isDirectory()) {
        // Looks like an an object
        if (potentialObject.match(DEPOSIT_DIR)) continue;
        if (
          await fs.pathExists(
            path.join(potentialObject, `0=ocfl_object_${this.ocflVersion}`)
          )
        ) {
          const objectConstructer = {
            ocflRoot: this.ocflRoot,
            objectPath: potentialObject.replace(this.ocflRoot, "")
          };
          this.emit("object", objectConstructer);
        } else {
          this.findObjects({ root: potentialObject });
        }
      }
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
}

module.exports = Repository;
