const {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} = require("@aws-sdk/client-s3");

(async () => {
  const configuration = {
    bucket: process.env.AWS_BUCKET_NAME,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    endpoint: process.env.AWS_ENDPOINT,
  };
  const client = new S3Client(configuration);

  let walk = true;
  let ContinuationToken = undefined;
  while (walk) {
    const params = {
      Bucket: configuration.bucket,
    };
    if (ContinuationToken) params.ContinuationToken = ContinuationToken;
    let command = new ListObjectsV2Command(params);
    let objects = await client.send(command);

    let keys = objects.Contents.map((entry) => entry.Key);
    keys = keys.map((k) => ({ Key: k }));
    command = new DeleteObjectsCommand({
      Bucket: configuration.bucket,
      Delete: { Objects: keys },
    });
    await client.send(command);

    if (objects.ContinuationToken) {
      ContinuationToken = objects.ContinuationToken;
    } else {
      walk = false;
    }
  }
})();
