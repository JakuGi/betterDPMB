// Digital Asset Links – potvrdzuje, že Android appka (TWA) patrí k tomuto webu.
// Servíruje sa na /.well-known/assetlinks.json (rewrite v next.config.ts).
//
// Odtlačok nášho podpisového kľúča je tu natvrdo. Po nahratí do Google Play pridaj
// do premennej ANDROID_SHA256_FINGERPRINTS aj odtlačok kľúča „App signing“ z Play Console
// (viac odtlačkov oddeľ čiarkou).

const PACKAGE_NAME = "io.github.jakugi.betterdpmb";
const RELEASE_KEY_SHA256 = "96:D5:FE:0B:10:19:0E:7D:94:F3:C0:3C:C4:4A:DE:55:31:41:A3:21:00:FB:87:49:EA:55:E7:A6:3E:F2:71:93";

export function GET() {
  const extra = (process.env.ANDROID_SHA256_FINGERPRINTS ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const fingerprints = [...new Set([RELEASE_KEY_SHA256, ...extra])];
  return Response.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: { namespace: "android_app", package_name: PACKAGE_NAME, sha256_cert_fingerprints: fingerprints },
      },
    ],
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
