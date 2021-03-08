const { S3, Bucket } = require("../lib/s3");
const chance = require("chance").Chance();
const { range } = require("lodash");

(async () => {
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
  let objects = await bucket.listObjects({});
  // console.log(objects.Contents);
  let file = objects.Contents.filter((o) => o.Key.match(/.*\/file1.txt/))[0];
  let url = await bucket.getPresignedUrl({ target: file.Key });
  console.log(url);
})();
