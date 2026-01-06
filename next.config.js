/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Exclude snowflake-sdk from being processed by webpack (server-only package)
  serverExternalPackages: ['snowflake-sdk'],
  // Support API routes with proper CORS and body parsing
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,DELETE,PATCH,POST,PUT' },
          { key: 'Access-Control-Allow-Headers', value: 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization' },
        ],
      },
    ];
  },
  webpack: (config, { isServer }) => {
    // Ignore TypeScript declaration files and binary files from node_modules
    config.module.rules.push(
      {
        test: /node_modules.*\.d\.ts$/,
        use: 'ignore-loader',
      },
      {
        test: /\.node$/,
        use: 'ignore-loader',
      }
    );

    // Only process snowflake-sdk on server side (it's Node.js only)
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        url: false,
        zlib: false,
        http: false,
        https: false,
        assert: false,
        os: false,
        path: false,
      };

      // Exclude snowflake-sdk from client bundle
      const originalExternals = config.externals;
      config.externals = [
        ...(Array.isArray(originalExternals) ? originalExternals : originalExternals ? [originalExternals] : []),
        function ({ request }, callback) {
          // Exclude snowflake-sdk and .node binary files
          if (
            request &&
            (request.includes('snowflake-sdk') ||
              request.match(/snowflake-sdk/) ||
              request.match(/\.node$/) ||
              request.match(/\/binaries\//))
          ) {
            return callback(null, `commonjs ${request}`);
          }
          callback();
        },
      ];
    }

    return config;
  },
};

module.exports = nextConfig;

