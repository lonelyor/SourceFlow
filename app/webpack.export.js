const path = require("path");
const webpack = require("webpack");
const pkg = require("./package.json");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const {CleanWebpackPlugin} = require("clean-webpack-plugin");
// const BundleAnalyzerPlugin = require("webpack-bundle-analyzer").BundleAnalyzerPlugin;
const {EsbuildPlugin} = require("esbuild-loader");

module.exports = (env, argv) => {
    return {
        mode: argv.mode || "development",
        watch: argv.mode !== "production",
        devtool: argv.mode !== "production" ? "eval-source-map" : false,
        cache: {
            type: "filesystem",
            name: `sourceflow-export-${argv.mode || "development"}`,
            buildDependencies: {
                config: [__filename],
            },
        },
        output: {
            publicPath: "auto",
            filename: "[name].js",
            path: path.resolve(__dirname, "stage/build/export"),
            libraryTarget: "umd",
            library: "Protyle",
            libraryExport: "default",
        },
        performance: {
            hints: false,
        },
        entry: {
            "protyle-method": "./src/protyle/export/runtime.ts",
        },
        optimization: {
            minimize: true,
            minimizer: [
                new EsbuildPlugin({
                    target: "es6",
                    sourcemap: argv.mode !== "production",
                }),
            ],
        },
        resolve: {
            fallback: {
                "path": require.resolve("path-browserify"),
            },
            extensions: [".ts", ".js", ".scss"],
        },
        module: {
            rules: [
                {
                    test: /\.ts(x?)$/,
                    include: [path.resolve(__dirname, "src")],
                    use: [
                        {
                            loader: "esbuild-loader",
                            options: {
                                target: "es6",
                                sourcemap: argv.mode !== "production",
                            }
                        },
                        {
                            loader: "ifdef-loader",
                            options: {
                                "ifdef-verbose": false,
                                BROWSER: true,
                                MOBILE: true,
                            },
                        },
                    ],
                },
                {
                    test: /\.css$/,
                    use: [
                        MiniCssExtractPlugin.loader,
                        {
                            loader: "css-loader",
                            options: {
                                sourceMap: argv.mode !== "production",
                            },
                        },
                    ],
                },
                {
                    test: /\.scss$/,
                    include: [
                        path.resolve(__dirname, "src/assets/scss"),
                    ],
                    use: [
                        MiniCssExtractPlugin.loader,
                        {
                            loader: "css-loader", // translates CSS into CommonJS
                            options: {
                                sourceMap: argv.mode !== "production",
                            },
                        },
                        {
                            loader: "sass-loader", // compiles Sass to CSS
                            options: {
                                sourceMap: argv.mode !== "production",
                            },
                        },
                    ],
                },
            ],
        },
        plugins: [
            // new BundleAnalyzerPlugin(),
            new CleanWebpackPlugin({
                cleanOnceBeforeBuildPatterns: [
                    path.join(__dirname, "stage/build/export")],
            }),
            new webpack.DefinePlugin({
                NODE_ENV: JSON.stringify(argv.mode),
                SOURCEFLOW_VERSION: JSON.stringify(pkg.version),
            }),
            new MiniCssExtractPlugin({
                filename: "base.css",
            }),
        ],
    };
};
