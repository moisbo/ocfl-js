const fs = require('fs-extra');
const path = require('path');
const shell = require('shelljs');
const hasha = require('hasha');

const _ = require('lodash');


const DIGEST_ALGORITHM = 'sha512';


class Object {
  

  constructor(path) {
    this.path = path;
    this.version = '1.0';
  }

  async initWithContentFromDir(id, dirPath) {
    await this.init();
    // Copy files into v1
    //const v1 = await fs.mkdir(path.join(aPath, "content", "v1"));
    const version = "v1"
    const v1 = await shell.cp("-R", dirPath, path.join(this.path, version, "content"))
    // Make an inventory
    const inv = await this.inventory(id, dirPath);

    // Put the inventory in the version dir
	const main_inv = await fs.writeJson(path.join(this.path, 'inventory.json'), inv, { spaces: 2});
	const version_inv = await fs.writeJson(path.join(this.path, version, "content", 'inventory.json'), inv, { spaces: 2});

    const inv_hash = await this.hash_file(path.join(this.path, 'inventory.json'))
    const hash_file = await fs.writeFile(path.join(this.path, 'inventory.json.' + DIGEST_ALGORITHM), inv_hash + "   inventory.json")
    const hash_file_v1 = await fs.writeFile(path.join(this.path, version, 'inventory.json.' + DIGEST_ALGORITHM), inv_hash + "   inventory.json")


  }

  async init() {
    // Creates a blank object with a content dir but no content
    const stats = await fs.stat(this.path);
    if (await fs.pathExists(this.path) && stats.isDirectory()) {
      const readDir = await fs.readdir(this.path);
      if (readDir.length <= 0) { // empty so initialise a repo here
        const generateNamaste = await this.generateNamaste(this.path, this.version);
      } else {
        const version = await this.isObject(this.path);
        if (version) {
          // Set version based on what was found in the namaste file
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

  async isObject(aPath) {
    // TODO: Check if this content root with NAMASTE and returns ocfl version
    // 0=ocfl_1.0
    // looks at path and see if the content of the file is
    // TODO: Make this look for a namaste file beginning with 0=ocfl_ and extract the version
    const theFile = path.join(aPath, this.nameVersion(this.version));
    return await fs.pathExists(theFile);
  }

  nameVersion(version) {
    return 'ocfl_object_' + version;

  }

  async generateNamaste(aPath, version) {
    const fileName = '0=' + this.nameVersion(version);
    const thePath = path.join(aPath, fileName);
    const writeFile = await fs.writeFile(thePath, this.nameVersion(version));
    const contentDir = await fs.mkdir(path.join(aPath, "v1"));
  }


  async digest_dir(dir) {
	var items = {};
	const contents = await fs.readdir(dir);
	items = _.flatten(await Promise.all(contents.map(async (p1) => {
		const p = path.join(dir, p1);
		const stats = await fs.stat(p);
		if( stats.isDirectory() ) {
			return await this.digest_dir(p);
		} else {
			const h = await this.hash_file(p);
			return [ p, h ];
		}
	})));
	return items;
}

async hash_file(p) {
	const hash = await hasha.fromFile(p, {algorithm: DIGEST_ALGORITHM})
	return hash;
}
async inventory(id, dir) {
	const inv = {
		'id': id,
		'type': 'https://ocfl.io/1.0/spec/#inventory',
		'digestAlgorithm': DIGEST_ALGORITHM,
		'head': 'v1'
	};
	var hashpairs = await this.digest_dir(dir);
	inv['manifest'] = {};
	for(let i = 0; i < hashpairs.length; i += 2 ) {
		inv['manifest'][hashpairs[i + 1]] = [hashpairs[i]];
	}
	return inv
}

}

module.exports = Object;
