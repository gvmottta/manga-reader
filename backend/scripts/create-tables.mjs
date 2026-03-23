import { DynamoDBClient, CreateTableCommand } from "@aws-sdk/client-dynamodb";

const client = new DynamoDBClient({ region: process.env.AWS_REGION ?? "sa-east-1" });

const tables = [
  {
    TableName: "manga-reader-comics",
    AttributeDefinitions: [
      { AttributeName: "id", AttributeType: "N" },
      { AttributeName: "source", AttributeType: "S" },
      { AttributeName: "source_id", AttributeType: "S" },
    ],
    KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    GlobalSecondaryIndexes: [
      {
        IndexName: "SourceIndex",
        KeySchema: [
          { AttributeName: "source", KeyType: "HASH" },
          { AttributeName: "source_id", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "ALL" },
      },
    ],
    BillingMode: "PAY_PER_REQUEST",
  },
  {
    TableName: "manga-reader-chapters",
    AttributeDefinitions: [
      { AttributeName: "id", AttributeType: "N" },
      { AttributeName: "comic_id", AttributeType: "N" },
      { AttributeName: "source_episode_id", AttributeType: "S" },
    ],
    KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    GlobalSecondaryIndexes: [
      {
        IndexName: "ComicIndex",
        KeySchema: [
          { AttributeName: "comic_id", KeyType: "HASH" },
          { AttributeName: "source_episode_id", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "ALL" },
      },
    ],
    BillingMode: "PAY_PER_REQUEST",
  },
  {
    TableName: "manga-reader-translations",
    AttributeDefinitions: [
      { AttributeName: "chapter_id", AttributeType: "N" },
      { AttributeName: "sk", AttributeType: "S" },
    ],
    KeySchema: [
      { AttributeName: "chapter_id", KeyType: "HASH" },
      { AttributeName: "sk", KeyType: "RANGE" },
    ],
    BillingMode: "PAY_PER_REQUEST",
  },
];

for (const table of tables) {
  try {
    await client.send(new CreateTableCommand(table));
    console.log(`✓ Created ${table.TableName}`);
  } catch (err) {
    if (err.name === "ResourceInUseException") {
      console.log(`- ${table.TableName} already exists, skipping`);
    } else {
      console.error(`✗ ${table.TableName}: ${err.message}`);
    }
  }
}
