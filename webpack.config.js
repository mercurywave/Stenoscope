const path = require('path');

module.exports = {
    entry: {
        app: ['./src/index.ts'],  // Entry point for your application
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: /node_modules/
            }
        ]
    },
    resolve: {
        extensions: ['.ts', '.js']
    },
    devtool: "source-map",
    output: {
        filename: '[name].bundle.js',
        path: path.resolve(__dirname, 'dist')
    },
    optimization: {
        splitChunks: {
            cacheGroups: {
                vendor: {
                    test: /[\\/]node_modules[\\/]/,
                    name: 'vendor',
                    chunks: 'all'
                }
            }
        }
    },
    cache: {
        type: 'filesystem',
        buildDependencies: {
            config: [__filename] // Add your config as buildDependency to get cache invalidation on config change
        }
    }
};