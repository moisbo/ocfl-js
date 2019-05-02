const fs = require('fs-extra');
const path = require('path');

class Repository {
  constructor(path) {
    this.path = path;
    this.version = '1.0';
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
      //else if it doesnt it dies
      throw new Error('directory does not exist');
    }
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
