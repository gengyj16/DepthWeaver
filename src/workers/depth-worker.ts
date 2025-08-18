
// In a dedicated worker file, e.g., src/workers/depth-worker.ts
import { pipeline, env } from '@huggingface/transformers';
import type { Pipeline } from '@huggingface/transformers';

// Configure the environment
env.allowLocalModels = true;
env.allowRemoteModels = true;
env.useFS = false; 
env.useCache = true;

class DepthEstimationPipeline {
    static task = 'depth-estimation';
    static instance: Pipeline | null = null;
    static model: string | null = null;

    static async getInstance(model: string, progress_callback?: Function) {
        if (this.instance === null || this.model !== model) {
            this.model = model;
            this.instance = await pipeline(this.task, model, {
                progress_callback,
            });
        }
        return this.instance;
    }
}


self.onmessage = async (event: MessageEvent) => {
    const { type, payload } = event.data;

    try {
        if (type === 'init') {
            await DepthEstimationPipeline.getInstance(payload.model, (progress: any) => {
                if (progress.status === 'progress') {
                    const percentage = (progress.progress).toFixed(2);
                    self.postMessage({ type: 'status', payload: `下载中... ${percentage}% (${(progress.loaded / 1024 / 1024).toFixed(2)}MB / ${(progress.total / 1024 / 1024).toFixed(2)}MB)` });
                } else if (progress.status === 'ready') {
                    self.postMessage({ type: 'status', payload: '模型准备就绪' });
                } else {
                    self.postMessage({ type: 'status', payload: progress.status });
                }
            });
            self.postMessage({ type: 'status', payload: '就绪' });

        } else if (type === 'generate') {
            self.postMessage({ type: 'status', payload: '正在生成深度图...' });

            const detector = await DepthEstimationPipeline.getInstance(DepthEstimationPipeline.model!, (p: any) => console.log(p));
            const { depth } = await detector(payload.imageUrl) as any;
            
            // Convert single-channel grayscale to RGBA
            const rgbaData = new Uint8ClampedArray(depth.width * depth.height * 4);
            for (let i = 0; i < depth.data.length; ++i) {
                const depthValue = depth.data[i];
                rgbaData[i * 4] = depthValue;       // R
                rgbaData[i * 4 + 1] = depthValue;   // G
                rgbaData[i * 4 + 2] = depthValue;   // B
                rgbaData[i * 4 + 3] = 255;          // A
            }

            self.postMessage({ type: 'result', payload: { depth: { data: rgbaData, width: depth.width, height: depth.height } } });
        }
    } catch (e: any) {
        self.postMessage({ type: 'error', payload: e.message });
    }
};

    