import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({ region: process.env.AWS_REGION ?? "sa-east-1" });
export const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

export const TABLES = {
  comics:       process.env.DYNAMODB_TABLE_COMICS       ?? "manga-reader-comics",
  chapters:     process.env.DYNAMODB_TABLE_CHAPTERS     ?? "manga-reader-chapters",
  translations: process.env.DYNAMODB_TABLE_TRANSLATIONS ?? "manga-reader-translations",
};
