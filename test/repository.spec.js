const assert = require('assert');
const path = require('path');
const fs = require('fs-extra');
const Repository = require('../lib/repository');
const OcflObject = require('../lib/object');

const shell = require("shelljs")
function createDirectory(aPath) {
  if (!fs.existsSync(aPath)) {
    fs.mkdirSync(aPath);
  }
}

describe('repoInit', function () {

  describe('no dir', function () {
    const repoPath = path.join(process.cwd(), './test-data/ocflX');
    const repository = new Repository(repoPath);
    it('should test directory', async function f() {
      try {
        const init = await repository.initRepo();
      } catch (e) {
        assert.strictEqual(e.code, 'ENOENT')
      }

    });
   
  });

  describe('no init', function () {
    const repoPath = path.join(process.cwd(), './test-data/notocfl');
    const repository = new Repository(repoPath);
    it('should not initialise directories with files', async function () {
      try {
        const init = await repository.initRepo();
      } catch (e) {
        assert.strictEqual(e.message, 'can\'t initialise a directory here as there are already files');
      }
    });
 
  });

});


describe('repository init 2', function () {
  const repositoryPath = path.join(process.cwd(), './test-data/ocfl1');
  
  const repository = new Repository(repositoryPath);
  const sourcePath1 = path.join(process.cwd(), './test-data/ocfl-object1-source');
  const sourcePath1_additional_files = sourcePath1 + "_additional_files";
  const repeatedFileHash = "31bca02094eb78126a517b206a88c73cfa9ec6f704c7030d18212cace820f025f00bf0ea68dbf3f3a5436ca63b53bf7bf80ad8d5de7d8359d0b7fed9dbc3ab99";
  const file1Hash = "4dff4ea340f0a823f15d3f4f01ab62eae0e5da579ccb851f8db9dfe84c58b2b37b89903a740e1ee172da793a6e79d560e5f7f9bd058a12a280433ed6fa46510a";
  const sepiaPicHash = "577b1610764f4d9d05e82b5efe9b39214806e4c29249b59634699101a2a4679317388e78f7b40134aba8371cc684a9b422a7032d34a6785201051e484805bd59";
  const sepiaPicPath =  "v1/content/sample/pics/sepia_fence.jpg"
  const sepiaPicLogicalPath =  "sample/pics/sepia_fence.jpg"


    const ocflVersion = "1.0";
    it('should test content root', async function () {
      fs.removeSync(repositoryPath);
      createDirectory(repositoryPath);
      const init = await repository.initRepo();

      assert.strictEqual(repository.ocflVersion, ocflVersion);
    });

    it('should have a namaste', function () {
      assert.strictEqual(repository.path, repositoryPath);
    });
    it('should have a namaste file', function () {
      //create this test path
      assert.strictEqual(fs.existsSync(path.join(repositoryPath, '0=ocfl_' + ocflVersion)), true);
    });

    const repository2 = new Repository(repositoryPath);
    it('should initialise in a directory with an existing namaste file', async function () {
      const init = await repository2.initRepo();
      assert.strictEqual(repository2.ocflVersion, ocflVersion)
    });

    it('should use your id for a new object if you give it one', async function(){
      const new_id = await repository.add_object_from_dir(sourcePath1, "some_other_id");
      // We got a UUID as an an ID
      assert.strictEqual(new_id, "some_other_id");
      // Check  that the object is there
      const objectPath  = path.join(repositoryPath, new_id.replace(/(..)/g, "$1/"));
      assert.strictEqual(fs.existsSync(objectPath), true);
     });


    it('should make up an ID if you add content', async function(){
      const new_id = await repository.add_object_from_dir(sourcePath1);
      // We got a UUID as an an ID
      assert.strictEqual(new_id.length, 36);
      // Check  that the object is there
      const objectPath  = path.join(repositoryPath, new_id.replace(/(..)/g, "$1/"));
      assert.strictEqual(fs.existsSync(objectPath), true);
     });

     


     it('should refuse to make an object if there is a faiiled attempt in the deposit dir', async function(){
      try {
          const depositDir = await fs.mkdir(path.join(repositoryPath, "deposit", "some_id"));
          const new_id = await repository.add_object_from_dir(sourcePath1, "some_id");
      }
      catch (e) {
        assert.strictEqual(e.message, 'There is already an object with this ID being deposited or left behind after a crash. Cannot proceed.');
      }
     });

     it('Should have two objects in it', async function(){
      const objects = await repository.objects();
      assert.strictEqual(objects.length, 2)
      
      //TODO - Check Object IDs

     });



     it('should handle file additions', async function(){
      fs.removeSync(repositoryPath);
      createDirectory(repositoryPath);
      fs.removeSync(sourcePath1_additional_files);
      shell.cp("-R", sourcePath1, sourcePath1_additional_files);
      // Add some identical additional files
    
      // Add some new additional files
      fs.writeFileSync(path.join(sourcePath1_additional_files, "sample", "file1.txt"), "$T)(*SKGJKVJS DFKJs");
      fs.writeFileSync(path.join(sourcePath1_additional_files, "sample", "file2.txt"), "$T)(*SKGJKdfsfVJS DFKJs");
    
      const init = await repository.initRepo();
      const test_id = "id";
      const id = await repository.add_object_from_dir(sourcePath1, test_id);
      const new_id = await repository.add_object_from_dir(sourcePath1_additional_files, test_id);
      // We got a UUID as an an ID
      assert.strictEqual(new_id, test_id);
      // Check  that the object is there
      const objectPath  = path.join(repositoryPath, new_id.replace(/(..)/g, "$1/"));
      assert.strictEqual(fs.existsSync(objectPath), true);
      // Check that it's v2
      const object = new OcflObject(objectPath);
      const o = await object.init();
      const inv = await object.getInventory();

      assert.strictEqual(object.contentVersion, "v2");
      assert.strictEqual(inv.versions["v2"].state[repeatedFileHash].length, 4);
      assert.strictEqual(inv.versions["v2"].state[repeatedFileHash].indexOf("sample/lots_of_little_files/file_0-copy1.txt") > -1, true);

      // Now delete some stuff 
      const rm = await fs.remove(path.join(sourcePath1_additional_files, "sample", "pics"));
      const new_id1 = await repository.add_object_from_dir(sourcePath1_additional_files, test_id);
      // Re-initialize exsiting object
      const o1 = await object.init();
      const inv1 = await object.getInventory();
      assert.strictEqual(object.contentVersion, "v3");  
      assert.strictEqual(Object.keys(inv1.manifest).length, 211);
      assert.strictEqual(inv1.manifest[sepiaPicHash][0], sepiaPicPath);
      // Sepia pic is v2
      assert.strictEqual(inv1.versions["v2"].state[sepiaPicHash][0], sepiaPicLogicalPath);
      // Not in v3
      assert.strictEqual(inv1.versions["v3"].state[sepiaPicHash], undefined);

      // Now put some stuff back
      console.log(path.join(sourcePath1, "sample","pics"))
      shell.cp("-R", path.join(sourcePath1, "sample","pics"), path.join(sourcePath1_additional_files, "sample"));
      const new_id2 = await repository.add_object_from_dir(sourcePath1_additional_files, test_id);
      const o2 = await object.init();
      const inv2 = await object.getInventory();
      assert.strictEqual(object.contentVersion, "v4");  
      assert.strictEqual(Object.keys(inv1.manifest).length, 211);
      assert.strictEqual(inv2.manifest[sepiaPicHash][0], sepiaPicPath);
      // Sepia pic is v2
      assert.strictEqual(inv2.versions["v4"].state[sepiaPicHash][0], sepiaPicLogicalPath);
      // Not in v3
      assert.strictEqual(inv2.versions["v3"].state[sepiaPicHash], undefined);
      // No content dirs in V3 or v4
      assert.strictEqual(fs.existsSync(path.join(object.path,"v3","content")), false) ;
      assert.strictEqual(fs.existsSync(path.join(object.path,"v4","content")), false);
      // Tho v2 has one
      assert.strictEqual(fs.existsSync(path.join(object.path,"v2","content")), true);
     });

     // TODO deal with versions (start by refusing to do a a v2)
     it('should export', async function(){ 
        // Assume the it function 'should handle file additions' has run and we have an initialized repo in repository
        const exportDirV1 = path.join("test-data", "exportv1");
        const rmf = await fs.remove(exportDirV1);

        const testId = "id";
        
        try {
          const init = await repository.export(testId, exportDirV1); 
        } catch (e) {
          assert.strictEqual(e.message, "Can't export as the directory does not exist.");
        }
        const fl = await fs.writeFile(exportDirV1, "");
        try {
          const init = await repository.export(testId, exportDirV1); 
        } catch (e) {
          assert.strictEqual(e.message, "Can't export to an existing file.");
        }
        const rmf1 = await fs.remove(exportDirV1);

        const newv1 = await fs.mkdir(exportDirV1);
        const init = await repository.export(testId, exportDirV1); 

        // TODO: test what to do if it contains something

        try {
          const init = await repository.export(testId, exportDirV1); 
        } catch (e) {
          assert.strictEqual(e.message, "Can't export to an existing file.");
        }
        //assert.strictEqual(false,true); // exported content is the same as /test-data/sourcePath1_additional_files'


        
     });

});



after(function () {
  //TODO: destroy test repoPath

});
