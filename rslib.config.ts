import { defineConfig } from '@rslib/core';

export default defineConfig({
  lib: [
    {
      format: 'esm',
      syntax: 'es2022',
      dts: true,
    },
  ],
  source: {
    entry: {
      index: './src/index.ts',
      'bin/deep-run': './src/bin/deep-run.ts',
    },
  },
  output: {
    target: 'node',
    distPath: {
      root: './dist',
    },
  },
  tools: {
    rspack: {
      module: {
        rules: [
          {
            // 为 CLI 入口添加 shebang
            test: /deep-run\.ts$/,
            type: 'javascript/auto',
          },
        ],
      },
      plugins: [
        {
          // 自定义插件：在构建输出中添加 shebang
          apply(compiler: { hooks: { emit: { tapAsync: (name: string, callback: (compilation: { assets: Record<string, { source: () => string; size: () => number }> }, cb: () => void) => void) => void } } }) {
            compiler.hooks.emit.tapAsync('AddShebangPlugin', (compilation, callback) => {
              const binAssetName = 'bin/deep-run.js';
              if (compilation.assets[binAssetName]) {
                const source = compilation.assets[binAssetName].source();
                const shebang = '#!/usr/bin/env node\n';
                if (!source.startsWith('#!')) {
                  compilation.assets[binAssetName] = {
                    source: () => shebang + source,
                    size: () => shebang.length + source.length,
                  };
                }
              }
              callback();
            });
          },
        },
      ],
    },
  },
});
