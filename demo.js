// Simple Demo script to show usage
const path = require('path');
const fs = require('fs-extra');
const OCFLRepository = require('./lib/repository');

// This is an asynchronous library so you need to call using await, or use promises
async function demo() {

  const demoRepoPath = path.join("demo", "repo");
  const demoContentPath = path.join("demo", "content");
  const demoExportPath = path.join("demo", "export");
  const dd = await fs.remove(demoExportPath);
  const demoObjectID1 = "https://example.com/object1";
  const demoObjectID2 = "https://example.com/object2";
  // new repository needs to be in an empty directory, so make one
  const rmdir = await fs.remove(demoRepoPath);
  if (!await fs.exists("demo")) {
    const demodir = await fs.mkdir("demo");
  }
  const dir = await fs.mkdir(demoRepoPath);
  // Make a new repository and initialise it
  var repo = await new OCFLRepository(demoRepoPath);
  var init = await repo.initRepo();

  // Make up some content
  const c = await fs.remove(demoContentPath);
  const rmc = await fs.mkdir(demoContentPath);

  // Test file
  const f1 = await fs.writeFile(path.join(demoContentPath, "file1.txt"), "some content");
  // Empty directory - won't get added to the repo
  const subDir = path.join(demoContentPath, "folder");
  const emp = await fs.mkdir(subDir);

  // Add demoContentPath to the repository 
  const new_object1 = await repo.add_object_from_dir(demoContentPath, demoObjectID1);
  var inv1 = await new_object1.getInventory();
  console.log("Head version of object 1", inv1.head);
  console.log("Object 1 has this many files", Object.keys(inv1.versions[inv1.head].state).length)

  const new_object2 = await repo.add_object_from_dir(demoContentPath, demoObjectID2);

  var inv1 = await new_object1.getInventory();

  console.log("Head version of object 1", inv1.head);


  // Same content as before so this will not be saved in the repository when we add the content
  const f21 = await fs.writeFile(path.join(demoContentPath, "file2.txt"), "some content");
  const f31 = await fs.writeFile(path.join(demoContentPath, "file3.txt"), "some other content");
  // Add something to our empty dir
  const f3 = await fs.writeFile(path.join(subDir, "file4.txt"), "yet more content");
  var objects = await repo.objects();
  console.log("We have this many objects:", objects.length);


  console.log("Re-add the demo directory to object1");
  const new_object1v1 = await repo.add_object_from_dir(demoContentPath, demoObjectID1);
  inv1 = await new_object1.getInventory();

  console.log("Head version of object 1:", inv1.head);
  console.log("Object 1 has this many files:", Object.keys(inv1.versions[inv1.head].state).length)
  console.log("Removing file3.txt from the content");
  const rmf3 = await fs.remove(path.join(demoContentPath, "file3.txt"));
  const new_object1v3 = await repo.add_object_from_dir(demoContentPath, demoObjectID1);
  inv1 = await new_object1.getInventory();
  console.log("Head version of object 1:", inv1.head);
  console.log("Object 1 has this many files:", Object.keys(inv1.versions[inv1.head].state).length)

  console.log("Exporting all the repository objects ")

  var objects = await repo.objects();

  async function exportVersions(o) {
    const inv = await (o.getInventory());
    const versionList = Object.keys(inv.versions);
    const id = inv.id;
    const exportPromises = versionList.map(async (v) => {
      const exportVDir = path.join(demoExportPath, o.path.replace(/\//g, ""), v)
      const e = await fs.mkdirp(exportVDir);
      return repo.export(id, exportVDir, { "version": v });
    });
    return await Promise.all(exportPromises);
  }

  const promises = objects.map((o) => exportVersions(o));
  await Promise.all(promises);

  // List objects

}

demo().then(() => { console.log("done") })
