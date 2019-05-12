const fs = require('fs-extra');
const path = require('path');
const pairtree = require('pairtree')
const OcflObject = require('../lib/object');
const uuidv4 = require("uuidv4")
const shell = require("shelljs")

class Repository {
  constructor(path) {
    this.path = path;
    this.ocflVersion = '1.0';
    // For now we're opinionated and only put things on pairtree paths
    this.objectIdToPath = pairtree.path;
  }

  async initRepo() {
    // Sets up an empty repository minus the requisite /v1 directory
    //checks if the dir exists else dies
    const stats = await fs.stat(this.path);
    console.log(stats);
    if (await fs.pathExists(this.path) && stats.isDirectory()) {
      const readDir = await fs.readdir(this.path);
      if (readDir.length <= 0) { // empty so initialise a repo here
        const generateNamaste = await this.generateNamaste(this.path, this.ocflVersion);
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

  async objects() {
    var objects = [];
    const o = await this.findObjects(this.path, objects);
    return objects, o;
  }

  incrementVersion(ver) {
    return "v" + (parseInt(ver.replace("v","")) + 1)
  }

  async findObjects(dir, objects) {
    // Recursive function to find OCFL objects
    const dirs = await fs.readdir(dir);
    for (let d of dirs) { 
      const potential_dir = path.join(dir, d);    
      const stats = await fs.stat(potential_dir);
      if (d != "deposit" && await fs.pathExists(potential_dir) && stats.isDirectory()){
          
          // Looks like an an object
          const object = await new OcflObject(potential_dir)
          const objectNamastePath = path.join(potential_dir, "0=" + object.nameVersion(this.ocflVersion));

          if (await fs.exists(objectNamastePath)) {
            const o = await object.init()
            objects.push(object)
          }
          else {
            objects.concat(await this.findObjects(potential_dir, objects));
          }
        }
   
    }
    return objects;
  }

  async add_object_from_dir(dir, id) {
    // Add an object to the repository given a source directory
    // dir = a directory somewhere on disk
    // id = an optional id String

    // Make a temp random ID used for deposit
    const   temp_id = uuidv4();

    // If no ID supplied use the random one - gets returned later
    // TODO: Make this a URI
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
    } else {
        const depositObjectPath = await fs.mkdir(objectDepositPath);
    } 

    // Make a temp object in the /deposit dir in our repo
    const object = await new OcflObject(objectDepositPath);
    // Add content by initialising object
    const initialized = await object.initWithContentFromDir(id, dir);
    const objectRepoPath = path.join(this.path, this.objectIdToPath(id));
    // Move (not copy) the object to the repository
    if (!await fs.pathExists(objectRepoPath)) {
      await object.removeEmptyDirectories();

      const moved = await fs.move(objectDepositPath, objectRepoPath);
    } else {
      // Merge object
      const added = await this.mergeObjectWith(object, objectRepoPath);
    }
    // TODO REMOVE temp dir
    return id;
  }




  async mergeObjectWith(newObject, prevObjectPath) {
    // Merge an object that's being submitted with one from the repositopry
    // We'll call this objec the NEW object and the one in the repo the EXISTING object

    // Get the inventory from the existing object
    const prevObject = new OcflObject(prevObjectPath);
    await prevObject.init();

    const prevInventory = await prevObject.getInventory();
    const newInventory = await newObject.getInventory();

    // Get latest state 
    const prevVersion = prevInventory.head;
    const prevState = prevInventory.versions[prevVersion].state
    const newState = newInventory.versions["v1"].state

    // Increment version number from existing object
    const newVersion = this.incrementVersion(prevVersion)
    console.log(newObject.path,  newVersion);

    // Move our v1 stuff to the new version number (we may delete some of it)
    const moved = await fs.move(path.join(newObject.path, "v1"),  path.join(newObject.path, newVersion)) ;
    const newVersionPath = path.join(newObject.path, newVersion)
    
    // Go thru latest state one hash at a time
    for (let hash of Object.keys(newState)) {
       // Inheritance: Files inherited from the previous version unchanged are
        //referenced in the state block of the new version. These entries will be
        // identical to the corresponding entries in the previous version's state
        // block.
      
      // THAT IS: If there's already a manifest entry for this then remove the file and leave the entry here
      
      // Now that we've checked agains the latest version, check against the all-time store of hashes we know about
      //for (let file of newState[hash]) {
      for (var i = 0; i < newState[hash].length; i += 1) {
        const file = newState[hash][i]; 
        //console.log("hash", hash, "FILE", file, "LENGTH OF ARRAY". newState[hash].length, "INDEX", i)
        if (!prevInventory.manifest[hash]) {
          // We don't have a copy of this anywhere
          // Addition: Newly added files appear as new entries in the state block of
          // the new version. The file should be stored and an entry for the new
            // content must be made in the manifest block of the object's inventory.
          prevInventory.manifest[hash] = [path.join(newVersion), "content", file];
          // now we have at least one copy - subsequent copies in incoming objects can be deleted
        }
        else {
          // We have a copy of this file so delete the physical file     
          // the file we have could be inhereted or re-instated
          const filePath = path.join(newVersionPath, "content", file);
          const del = await fs.remove(filePath);
        }

    }
  }
  // Deletion: Files deleted from the previous version are simply removed
  // from the state block of the new version
  // We never added them!
  console.log("Popping in the new version ", newVersion)
  prevInventory.versions[newVersion] = newInventory.versions["v1"] // As updated
  prevInventory.head = newVersion;
  // Copy in the new version dir
  const invs = await newObject.writeInventories(prevInventory, newVersion)
  const rm =  await newObject.removeEmptyDirectories();
  const vmoved = await fs.move(newVersionPath, path.join(prevObject.path, newVersion));
  const invs_new = await prevObject.writeInventories(prevInventory, newVersion);
  await fs.remove(newObject.path)
}

  async isContentRoot(aPath) {
    // TODO: Check if this content root with NAMASTE and returns ocfl version
    // 0=ocfl_1.0
    // looks at path and see if the content of the file is
    // TODO: hardcoded this version?
    const namastePath = path.join(aPath, "0=" + this.nameVersion(this.ocflVersion));
    return await fs.pathExists(namastePath);
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
