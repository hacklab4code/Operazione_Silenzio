const path = require('path');

module.exports = {
  style: {
    postcss: {
      plugins: [
        require('tailwindcss'),
        require('autoprefixer'),
      ],
    },
  },
  webpack: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    configure: (webpackConfig) => {
      // Prevent infinite recompilation loop
      webpackConfig.watchOptions = {
        ignored: /node_modules/,
        aggregateTimeout: 300,
      };
      return webpackConfig;
    },
  },
  devServer: (devServerConfig) => {
    // Keep browser requests on the frontend origin and route the API to the
    // same backend started by avvia.sh. Do not target a stale portable copy.
    devServerConfig.proxy = [
      {
        context: ['/api'],
        target: 'http://127.0.0.1:8001',
        changeOrigin: true,
        proxyTimeout: 180000,
        timeout: 180000,
      },
    ];
    // Fix for webpack-dev-server v4+ compatibility
    delete devServerConfig.onAfterSetupMiddleware;
    delete devServerConfig.onBeforeSetupMiddleware;

    // Move https to server option
    if (devServerConfig.https !== undefined) {
      devServerConfig.server = devServerConfig.https ? 'https' : 'http';
      delete devServerConfig.https;
    }

    devServerConfig.setupMiddlewares = (middlewares, devServer) => {
      // Patch Node 22 compatibility: devServer.close may not be a function
      if (devServer && typeof devServer.close !== 'function') {
        devServer.close = (cb) => { if (cb) cb(); };
      }
      return middlewares;
    };

    // Disable liveReload to reduce recompile loops
    devServerConfig.liveReload = false;

    return devServerConfig;
  },
};
