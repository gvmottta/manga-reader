import {
  CloudFrontClient,
  CreateDistributionCommand,
} from "@aws-sdk/client-cloudfront";

const client = new CloudFrontClient({ region: "us-east-1" });

const s3WebsiteOrigin = "manga-reader-frontend.s3-website-sa-east-1.amazonaws.com";

const command = new CreateDistributionCommand({
  DistributionConfig: {
    CallerReference: `manga-reader-${Date.now()}`,
    Comment: "manga-reader frontend",
    DefaultRootObject: "index.html",
    Origins: {
      Quantity: 1,
      Items: [
        {
          Id: "s3-website",
          DomainName: s3WebsiteOrigin,
          CustomOriginConfig: {
            HTTPPort: 80,
            HTTPSPort: 443,
            OriginProtocolPolicy: "http-only",
          },
        },
      ],
    },
    DefaultCacheBehavior: {
      TargetOriginId: "s3-website",
      ViewerProtocolPolicy: "redirect-to-https",
      AllowedMethods: { Quantity: 2, Items: ["GET", "HEAD"] },
      CachedMethods: { Quantity: 2, Items: ["GET", "HEAD"] },
      Compress: true,
      ForwardedValues: {
        QueryString: false,
        Cookies: { Forward: "none" },
        Headers: { Quantity: 0, Items: [] },
      },
      MinTTL: 0,
      DefaultTTL: 86400,
      MaxTTL: 31536000,
    },
    // Return index.html for 403/404 so React Router works
    CustomErrorResponses: {
      Quantity: 2,
      Items: [
        {
          ErrorCode: 403,
          ResponsePagePath: "/index.html",
          ResponseCode: "200",
          ErrorCachingMinTTL: 0,
        },
        {
          ErrorCode: 404,
          ResponsePagePath: "/index.html",
          ResponseCode: "200",
          ErrorCachingMinTTL: 0,
        },
      ],
    },
    PriceClass: "PriceClass_All",
    Enabled: true,
    HttpVersion: "http2",
    IsIPV6Enabled: true,
    Aliases: { Quantity: 0, Items: [] },
    ViewerCertificate: {
      CloudFrontDefaultCertificate: true,
      MinimumProtocolVersion: "TLSv1.2_2021",
    },
    Restrictions: {
      GeoRestriction: { RestrictionType: "none", Quantity: 0, Items: [] },
    },
  },
});

const result = await client.send(command);
const dist = result.Distribution;
console.log("✓ CloudFront distribution created!");
console.log(`  ID:     ${dist.Id}`);
console.log(`  URL:    https://${dist.DomainName}`);
console.log(`  Status: ${dist.Status} (takes ~10 min to deploy globally)`);
