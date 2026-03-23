#!/bin/bash
set -e

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BUILD_DIR=/tmp/lambda-build
REGION=sa-east-1
FUNCTION=manga-reader-backend
S3_BUCKET=manga-reader-frontend

echo "Building TypeScript..."
cd "$REPO_ROOT"
npm run build --workspace=backend

echo "Assembling build directory..."
rm -rf "$BUILD_DIR"
mkdir "$BUILD_DIR"
cp -r backend/dist "$BUILD_DIR/dist"
cp backend/package.json "$BUILD_DIR/"

echo "Installing Linux/x64 dependencies..."
cd "$BUILD_DIR"
npm install --os=linux --cpu=x64 --omit=dev

echo "Zipping..."
zip -r /tmp/lambda.zip dist/ node_modules/ package.json

echo "Uploading to S3..."
aws s3 cp /tmp/lambda.zip "s3://$S3_BUCKET/lambda.zip" --region "$REGION"

echo "Updating Lambda..."
aws lambda update-function-code \
  --function-name "$FUNCTION" \
  --s3-bucket "$S3_BUCKET" \
  --s3-key lambda.zip \
  --region "$REGION" \
  --query 'LastModified' --output text

echo "Done!"
