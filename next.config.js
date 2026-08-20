/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow larger JSON payloads (cached review datasets can be big).
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

module.exports = nextConfig;
