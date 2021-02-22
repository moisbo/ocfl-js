const { S3, Bucket } = require("../lib/s3");
const chance = require("chance").Chance();
const { range } = require("lodash");

(async () => {
  const N_OBJECTS = 50;
  const configuration = {
    type: "S3",
    s3: {
      bucket: process.env.AWS_BUCKET_NAME,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      endpoint: process.env.AWS_ENDPOINT,
    },
  };
  let bucket = new Bucket(configuration.s3);

  for (let i in range(N_OBJECTS)) {
    console.log(`Creating object ${i}`);
    let id = chance.hash();
    await bucket.upload({
      target: `OCFL_oid_${id}`,
      content: id,
    });

    let files = [
      `${id}/0=ocfl_object_1.0`,
      `${id}/inventory.json`,
      `${id}/inventory.json.sha512`,
      `${id}/v1/inventory.json`,
      `${id}/v1/inventory.json.sha512`,
      `${id}/v1/content/file1.txt`,
      `${id}/v1/content/file2.txt`,
      `${id}/v1/content/file3.txt`,
      `${id}/v1/content/file4.txt`,
      `${id}/v1/content/file5.txt`,
      `${id}/v1/content/file6.txt`,
      `${id}/v1/content/file7.txt`,
      `${id}/v1/content/file8.txt`,
      `${id}/v1/content/file9.txt`,
      `${id}/v1/content/file10.txt`,
    ];
    for (let file of files) {
      await bucket.upload({
        target: `${file}`,
        content: id,
      });
    }
  }
})();
