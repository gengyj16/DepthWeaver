// Depth Estimation Worker using @huggingface/transformers
import { pipeline, env } from '@huggingface/transformers';

// Configure the environment
env.allowRemoteModels = true;
env.useFS = false;
// @ts-ignore
env.useCache = true;

interface DepthEstimationResult {
  depth: {
    data: Uint8ClampedArray;
    width: number;
    height: number;
  };
}

class DepthEstimationPipeline {
  private static task: any = 'depth-estimation';
  private static instance: any = null;
  private static model: string | null = null;
  private static device: 'wasm' | 'webgpu' = 'wasm';
  private static initialized = false;
  private static initializing = false;

  static async detectDevice(): Promise<'wasm' | 'webgpu'> {
    // @ts-ignore
    if (typeof self !== 'undefined' && self.navigator?.gpu) {
      try {
        // @ts-ignore
        const adapter = await self.navigator.gpu.requestAdapter();
        if (adapter) {
          console.log('[Depth Worker] WebGPU adapter found, using WebGPU');
          return 'webgpu';
        }
      } catch (e) {
        console.warn('[Depth Worker] WebGPU detection failed:', e);
      }
    }
    console.log('[Depth Worker] Using WASM fallback');
    return 'wasm';
  }

  static async initialize(
    modelName: string,
    useMirror: boolean,
    onProgress?: (progress: any) => void
  ): Promise<void> {
    if (this.initializing) {
      console.log('[Depth Worker] Already initializing, waiting...');
      while (this.initializing) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return;
    }

    if (this.initialized && this.model === modelName) {
      console.log('[Depth Worker] Already initialized with model:', modelName);
      return;
    }

    this.initializing = true;

    try {
      // Set device
      this.device = await this.detectDevice();
      self.postMessage({ type: 'device-info', payload: this.device });

      // Set remote host
      // @ts-ignore
      env.remoteHost = useMirror 
        ? "https://www.modelscope.cn/models" 
        : "https://huggingface.co";

      console.log('[Depth Worker] Initializing pipeline with model:', modelName);
      console.log('[Depth Worker] Using device:', this.device);
      console.log('[Depth Worker] Remote host:', env.remoteHost);

      // Create progress callback
      const progressCallback = (progress: any) => {
        console.log('[Depth Worker] Progress:', progress);
        if (onProgress) onProgress(progress);
      };

      // Initialize pipeline
      this.instance = await pipeline(
        this.task,
        modelName,
        { 
          progress_callback: progressCallback,
          device: this.device
        }
      );

      this.model = modelName;
      this.initialized = true;
      console.log('[Depth Worker] Pipeline initialized successfully');

    } catch (error) {
      console.error('[Depth Worker] Initialization failed:', error);
      this.initialized = false;
      this.instance = null;
      throw error;
    } finally {
      this.initializing = false;
    }
  }

  static async generate(imageUrl: string): Promise<DepthEstimationResult> {
    if (!this.initialized || !this.instance) {
      throw new Error('Pipeline not initialized. Call initialize() first.');
    }

    console.log('[Depth Worker] Generating depth map for:', imageUrl);

    try {
      const result = await this.instance(imageUrl);
      console.log('[Depth Worker] Generation result:', result);

      if (!result || !result.depth) {
        throw new Error('Invalid result from depth estimation model');
      }

      const { depth } = result;

      // Convert single-channel grayscale to RGBA
      const rgbaData = new Uint8ClampedArray(depth.width * depth.height * 4);
      for (let i = 0; i < depth.data.length; ++i) {
        const depthValue = depth.data[i];
        rgbaData[i * 4] = depthValue;       // R
        rgbaData[i * 4 + 1] = depthValue;   // G
        rgbaData[i * 4 + 2] = depthValue;   // B
        rgbaData[i * 4 + 3] = 255;          // A
      }

      return {
        depth: {
          data: rgbaData,
          width: depth.width,
          height: depth.height
        }
      };
    } catch (error) {
      console.error('[Depth Worker] Generation failed:', error);
      throw error;
    }
  }

  static isInitialized(): boolean {
    return this.initialized;
  }
}

// Handle messages from main thread
self.onmessage = async (event: MessageEvent) => {
  const { type, payload } = event.data;

  try {
    switch (type) {
      case 'init':
        if (payload.model === 'pre-check') {
          // Just detect device without loading model
          const device = await DepthEstimationPipeline.detectDevice();
          self.postMessage({ type: 'device-info', payload: device });
          self.postMessage({ type: 'status', payload: '就绪' });
        } else {
          self.postMessage({ type: 'status', payload: '正在初始化模型...' });
          
          await DepthEstimationPipeline.initialize(
            payload.model,
            payload.useMirror,
            (progress: any) => {
              if (progress.status === 'progress') {
                const percentage = progress.progress || 0;
                self.postMessage({ 
                  type: 'progress', 
                  payload: { 
                    percentage: percentage,
                    loaded: progress.loaded,
                    total: progress.total
                  } 
                });
                self.postMessage({ 
                  type: 'status', 
                  payload: `下载模型中... ${percentage.toFixed(1)}%` 
                });
              } else if (progress.status === 'ready') {
                self.postMessage({ type: 'status', payload: '模型准备就绪' });
              }
            }
          );
          
          self.postMessage({ type: 'status', payload: '就绪' });
        }
        break;

      case 'generate':
        if (!DepthEstimationPipeline.isInitialized()) {
          throw new Error('Pipeline not initialized. Call init first.');
        }

        self.postMessage({ type: 'status', payload: '正在生成深度图...' });
        
        const result = await DepthEstimationPipeline.generate(payload.imageUrl);
        self.postMessage({ type: 'result', payload: result });
        break;

      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error: any) {
    console.error('[Depth Worker] Error:', error);
    self.postMessage({ 
      type: 'error', 
      payload: error.message || 'Unknown error occurred' 
    });
  }
};

console.log('[Depth Worker] Worker script loaded');
