/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // non far fallire la build se ESLint trova errori
    ignoreDuringBuilds: true,
  },
};
export default nextConfig;
