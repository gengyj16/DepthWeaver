# DepthWeaver

DepthWeaver 在浏览器中把原图与灰度深度图组合成可交互的 3D / 2.5D 照片。项目现在提供两套互相独立、可随时切换的浏览方式：

- **经典高度场**：保留原有网格位移、边界模糊、相机和 GLB 导出能力。
- **空间照片**：使用深度 ray-marching、遮挡区域补全和虚拟相机平移，减少前景边缘拉伸与空洞。

深度图上传、本地 Depth Anything 推理和远程 API 生成流程保持不变。空间照片模式直接复用当前深度图，不会重复估计深度。

## 空间照片流程

1. 在 Web Worker 中检测深度不连续边界。
2. 根据允许的最大视差，仅重建前景后方可能暴露的窄带区域。
3. 立即生成深度定向补全结果，保证无模型时也能使用。
4. 默认在设备端运行 MI-GAN ONNX，后台替换为更自然的补全背景。
5. 使用深度 ray-marching Shader 实时查找可见表面，并在 disocclusion 区域采样补全背景。
6. 将模型与生成资产缓存到浏览器；照片像素不会发送到补全服务器。

首次启用 AI 补全会下载约 28.1 MB 的模型。可通过环境变量替换模型地址：

```bash
NEXT_PUBLIC_MIGAN_MODEL_URL=https://example.com/migan_pipeline_v2.onnx
```

AI 模型或 WebGPU 不可用时，空间照片仍会使用深度定向补全；ONNX 推理会在可能时使用 WebGPU，否则回退到 WASM。

## 开发

```bash
npm ci
npm run dev
```

默认开发地址为 `http://localhost:9002`。

验证命令：

```bash
npm run test
npm run typecheck
npm run build
```

## 浏览器要求

- WebGL 2 推荐，用于空间照片实时渲染；
- WebGPU 推荐，用于 MI-GAN 加速；
- 没有 WebGPU 时可使用 WASM，但首次补全耗时会更长；
- HTTPS 或 localhost 才能使用 WebGPU 和移动设备方向传感器的完整能力。

## 技术与许可证说明

空间照片方案的技术调研、取舍和边界见 [`docs/spatial-photo-architecture.md`](docs/spatial-photo-architecture.md)。

MI-GAN 的官方实现采用 MIT License。本仓库不包含模型权重，浏览器首次使用时从配置的模型地址下载并缓存。其他调研项目仅用于验证技术路线，没有复制 GPL/AGPL 项目代码。
