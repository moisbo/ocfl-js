const { S3, Bucket } = require("../lib/s3");

(async () => {
  const configuration = {
    s3: {
      bucket: process.env.AWS_BUCKET_NAME,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      endpoint: process.env.AWS_ENDPOINT,
    },
  };
  let bucket = new Bucket(configuration.s3);
  let content = await bucket.listObjects({});
  if (content.Contents) {
    let keys = content.Contents.map((o) => o.Key);
    await bucket.removeObjects({ keys });
  }
})();
