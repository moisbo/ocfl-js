const fs = require('fs-extra');
const path = require('path');
const shell = require('shelljs');
const hasha = require('hasha');
const uuidv5 = require('uuid/v5');
const _ = require('lodash');


const DIGEST_ALGORITHM = 'sha512';


class Object {
  

  constructor(path) {
    this.path = path;
    this.ocflVersion = '1.0';
    this.contentVersion = 0; // No content yet
    this.id = null; // Not set yet
  }

  async initWithContentFromDir(id, dirPath) {
    await this.init();
    // Copy files into v1
    //const v1 = await fs.mkdir(path.join(aPath, "content", "v1"));
    const version = "v1" // Always a fresh start as we're not touching an existing repo object

    const v1 = await shell.cp("-R", dirPath, path.join(this.path, version, "content"))
    // Make an inventory
    const inv = await this.inventory(id, dirPath);

    // Put the inventory in the root AND version dir
    const main_inv = await fs.writeJson(path.join(this.path, 'inventory.json'), inv, { spaces: 2});
    // Commenting this out for a bit until we get the main inventory sorted
    //const version_inv = await fs.writeJson(path.join(this.path, version, "content", 'inventory.json'), inv, { spaces: 2});

    // Make digests
    const inv_hash = await this.hash_file(path.join(this.path, 'inventory.json'))
    const digest_file = await fs.writeFile(path.join(this.path, 'inventory.json.' + DIGEST_ALGORITHM), inv_hash + "   inventory.json");
    // Commenting this out for a bit until we get the main inventory sorted
    //const digest_file_v1 = await fs.writeFile(path.join(this.path, version, "content", 'inventory.json.' + DIGEST_ALGORITHM), inv_hash + "   inventory.json");
    this.contentVersion = await this.determineVersion(); 
  }

  async init() {
    // Tries to load an exsiting object, or creates a blank object with a content dir but no content
    const stats = await fs.stat(this.path);
    if (await fs.pathExists(this.path) && stats.isDirectory()) {
      const readDir = await fs.readdir(this.path);
      if (readDir.length <= 0) { // empty so initialise a repo here
        const generateNamaste = await this.generateNamaste(this.path, this.ocflVersion);

      } else {
        const ocflVersion = await this.isObject(this.path);
        if (ocflVersion) {
          // Set content version
          this.contentVersion = await this.determineVersion();
        } else {
          throw new Error('can\'t initialise a directory here as there are already files')
        }
      }
    } else {
      //else if it doesnt it dies
      throw new Error('directory does not exist');
    }
  }
 
  getVersionString(i) {
     // Make a version name as per the SHOULD in the spec v1..vn
     // TODO have an option for zero padding
    return "v" + i
  }

  async determineVersion(aPath) {
    const inventoryPath = path.join(this.path, "inventory.json");
    if (await fs.exists(inventoryPath)){
        const inv = await JSON.parse(fs.readFileSync(inventoryPath));
        return parseInt(inv.head.replace("v",""))
    }
    else {
        return 0;
    }
    // Here's not how to do it: 
    /* var version = 0;
    const dirContents = await fs.readdir(this.path);
    for (let f of dirContents.filter(function(d){return d.match(/^v\d+$/)})){    
        const v =  parseInt(f.replace("v",""));
        if (v > version) {
            version = v;
        }
    }
    return version;10. */
    // Look at each dir that matches v\d+

  }

  async isObject(aPath) {
    // TODO: Check if this content root with NAMASTE and returns ocfl version
    // 0=ocfl_object_1.0
    // looks at path and see if the content of the file is
    // TODO: Make this look for a namaste file beginning with 0=ocfl_object_ and extract the version
    const theFile = path.join(aPath, "0=" + this.nameVersion(this.ocflVersion));
    //TODO - use the file name...
    this.ocflVersion = this.ocflVersion; // I know! But we need to sniff this out from the file
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
		'head': this.getVersionString(this.ocflVersion) 
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
