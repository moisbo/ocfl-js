const fs = require('fs-extra');
const path = require('path');
const pairtree = require('pairtree')
const Object = require('../lib/object');
const uuidv4 = require("uuidv4")

class Repository {
  constructor(path) {
    this.path = path;
    this.version = '1.0';
    // For now we're opinionated and only put things on pairtree paths
    this.objectIdToPath = pairtree.path;
  }

  async initRepo() {
    //checks if the dir exist else dies
    const stats = await fs.stat(this.path);
    if (await fs.pathExists(this.path) && stats.isDirectory()) {
      const readDir = await fs.readdir(this.path);
      if (readDir.length <= 0) { // empty so initialise a repo here
        const generateNamaste = await this.generateNamaste(this.path, this.version);
      } else {
        const version = await this.isContentRoot(this.path);
        if (version) {
          //Looks for namaste files in the directory
        } else {
          throw new Error('can\'t initialise a directory here as there are already files')
        }
      }
    } else {
      //else if dir doesn't exist it dies
      throw new Error('directory does not exist');
    }
  }


  async add_object_from_dir(dir, id) {
    // Add an object to the repository given a source directory
    // dir = a directory somewhere on disk
    // id = an optional id String

    // Make a temp random id
    const   temp_id = uuidv4();
    if (!id) {id = temp_id};
    // Make sure we have a working directory
    const depositPath = path.join(this.path, "deposit");
    if (!await fs.pathExists(depositPath)) {
        const depositDir = await fs.mkdir(depositPath);
    }
    // Make a temp directory under STORAGE_ROOT/deposit/
    const objectDepositPath = path.join(this.path, "deposit", id);
    if (await fs.pathExists(objectDepositPath)) {
        throw new Error('There is already an object with this ID being deposited or left behind after a crash. Cannot proceed.')
    }
    else {
        const depositObjectPath = await fs.mkdir(objectDepositPath);
    } 
    // Make a temp object in the /deposit dir in our repo
    const object = await new Object(objectDepositPath);
    // Add content
    const initialized = await object.initWithContentFromDir(id, dir);
    // Move the object  to the repository
    const moved = await fs.move(objectDepositPath, path.join(this.path, this.objectIdToPath(id)));
    // TODO REMOVE temp dir
    return id;
  }

  determineVersion(aPath) {
    // TODO: how to determine the version of the directory?
  }

  async isContentRoot(aPath) {
    // TODO: Check if this content root with NAMASTE and returns ocfl version
    // 0=ocfl_1.0
    // looks at path and see if the content of the file is
    // TODO: hardcoded this version?
    const theFile = path.join(aPath, this.nameVersion(this.version));
    return await fs.pathExists(theFile);
  }

  nameVersion(version) {
    return 'ocfl_' + version;
  }

  async generateNamaste(aPath, version) {
    const fileName = '0=' + this.nameVersion(version);
    const thePath = path.join(aPath, fileName);
    const writeFile = await fs.writeFile(thePath, this.nameVersion(version));
  }
}

module.exports = Repository;
